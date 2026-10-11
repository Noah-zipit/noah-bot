// src/lib/shopAgent.ts — business-agnostic WhatsApp shop-agent engine.
// Generalizes the old T&A demo (taDemo.ts, left untouched) across businesses.
// Each business is driven by data/businesses/<id>.json (see shopBrain.ts).
// Runtime state lives in data/shop-state.json; remote config/sync via Supabase.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WASocket } from '@whiskeysockets/baileys'
import type { ParsedMessage } from '../core/types.js'
import {
  loadBusiness,
  buildSystemPrompt,
  brainAnswer,
  type BusinessConfig,
  type Turn,
} from './shopBrain.js'
import * as sync from './supabaseSync.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..')
const FISH_DIR = path.join(process.env.HOME ?? '/home/hatch', 'workspace/skills/fish-audio/bin')
const TTS_CLI = path.join(FISH_DIR, 'fish-tts')
const ASR_CLI = path.join(FISH_DIR, 'fish-asr')
const TMP_DIR = path.join(REPO_ROOT, 'tmp', 'shop-agent')

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(REPO_ROOT, 'data')
}
function stateFile(): string {
  return path.join(dataDir(), 'shop-state.json')
}

// ------------------------------------------------------------------ state
export interface CartItem { name: string; qty: number }
export interface ChatState {
  greeted: boolean
  askedQualifier: boolean
  askedCity: boolean
  qualifier?: string
  ended: boolean
  cart: CartItem[]
  history: Turn[]
  nudgeSent: boolean
  lastActive: number
  fallbackStreak: number
  awaitingLead: boolean
  leadSaved: boolean
  awaitingSlot: boolean
  checkoutPending: boolean
  urduScript: boolean
}
interface BizState { chats: string[]; states: Record<string, ChatState>; voiceId?: string }
interface ShopState { businesses: Record<string, BizState>; migratedTaDemo?: boolean }

function freshChatState(): ChatState {
  return {
    greeted: false, askedQualifier: false, askedCity: false, ended: false,
    cart: [], history: [], nudgeSent: false, lastActive: Date.now(),
    fallbackStreak: 0, awaitingLead: false, leadSaved: false,
    awaitingSlot: false, checkoutPending: false, urduScript: false,
  }
}

function loadState(): ShopState {
  let s: ShopState
  try {
    s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as ShopState
    if (!s.businesses) s.businesses = {}
  } catch {
    s = { businesses: {} }
  }
  // One-time migration: import the old T&A demo chats into ta-electronics.
  if (!s.migratedTaDemo) {
    try {
      const old = JSON.parse(fs.readFileSync(path.join(dataDir(), 'ta-demo.json'), 'utf8')) as { chats?: string[] }
      if (Array.isArray(old.chats) && old.chats.length) {
        const b = (s.businesses['ta-electronics'] ||= { chats: [], states: {} })
        for (const c of old.chats) if (!b.chats.includes(c)) b.chats.push(c)
        console.log(`[shopagent] migrated ${old.chats.length} T&A demo chats`)
      }
    } catch { /* no old state */ }
    s.migratedTaDemo = true
    saveState(s)
  }
  return s
}

function saveState(s: ShopState): void {
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
  fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2))
}

function digitsOf(jid: string): string {
  return (jid || '').replace(/\D/g, '')
}

function getBizState(s: ShopState, bizId: string): BizState {
  return (s.businesses[bizId] ||= { chats: [], states: {} })
}

function stateKey(chat: string, sender?: string): string {
  return digitsOf(sender || chat)
}

function getChatState(s: ShopState, bizId: string, chat: string, sender?: string): ChatState {
  const b = getBizState(s, bizId)
  const k = stateKey(chat, sender)
  if (!b.states[k]) b.states[k] = freshChatState()
  return b.states[k]
}

/** Which business owns this chat (digits-compared, chat or sender)? */
export function bizForChat(chat: string, sender?: string): string | null {
  const s = loadState()
  const targets = [chat, sender].filter((x): x is string => !!x).map(digitsOf)
  for (const [bizId, b] of Object.entries(s.businesses)) {
    if (b.chats.some(c => targets.includes(digitsOf(c)))) return bizId
  }
  return null
}

export function isShopChat(chat: string, sender?: string): boolean {
  return bizForChat(chat, sender) !== null
}

export function setShopChat(bizId: string, chat: string, on: boolean): boolean {
  if (!loadBusiness(bizId) && !sync.getBusinessConfig(bizId)) return false
  const s = loadState()
  const b = getBizState(s, bizId)
  if (on && !b.chats.includes(chat)) b.chats.push(chat)
  if (!on) {
    b.chats = b.chats.filter(c => c !== chat)
    delete b.states[stateKey(chat)]
  }
  saveState(s)
  return true
}

export function setShopChatOffEverywhere(chat: string): string[] {
  const s = loadState()
  const off: string[] = []
  for (const [bizId, b] of Object.entries(s.businesses)) {
    if (b.chats.includes(chat)) {
      b.chats = b.chats.filter(c => c !== chat)
      off.push(bizId)
    }
  }
  saveState(s)
  return off
}

export function listShopChats(bizId?: string): Record<string, string[]> {
  const s = loadState()
  const out: Record<string, string[]> = {}
  for (const [id, b] of Object.entries(s.businesses)) {
    if (bizId && id !== bizId) continue
    out[id] = b.chats
  }
  return out
}

export function setShopVoice(bizId: string, voiceId: string): void {
  const s = loadState()
  getBizState(s, bizId).voiceId = voiceId
  saveState(s)
}

function getVoiceId(biz: BusinessConfig): string | undefined {
  const s = loadState()
  return s.businesses[biz.id]?.voiceId || biz.voice?.voiceId || process.env.FISH_VOICE_ID || undefined
}

// ------------------------------------------------------------ fish audio
function stripFormat(str: string): string {
  return str.replace(/\*/g, '').replace(/<[^>]*>/g, '')
}

async function fishTts(text: string, outMp3: string, voiceId?: string): Promise<boolean> {
  try {
    const args = ['--out', outMp3, '--text', text]
    if (voiceId) args.push('--voice-id', voiceId)
    await execFileAsync(TTS_CLI, args, { timeout: 90000 })
    return fs.existsSync(outMp3) && fs.statSync(outMp3).size > 1000
  } catch (e) {
    console.error('[shopagent] tts failed:', (e as Error).message)
    return false
  }
}

async function fishAsr(inAudio: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(ASR_CLI, ['--in', inAudio], { timeout: 120000 })
    const r = JSON.parse(stdout)
    const t = (r.text ?? '').trim()
    return t || null
  } catch (e) {
    console.error('[shopagent] asr failed:', (e as Error).message)
    return null
  }
}

async function sendVoiceNote(sock: WASocket, chat: string, text: string, quoted: unknown, voiceId?: string): Promise<void> {
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const stamp = Date.now()
  const mp3 = path.join(TMP_DIR, `tts-${stamp}.mp3`)
  const ogg = path.join(TMP_DIR, `tts-${stamp}.ogg`)
  try {
    const ok = await fishTts(stripFormat(text).slice(0, 600), mp3, voiceId)
    if (!ok) return
    await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-c:a', 'libopus', '-b:a', '32k', ogg], { timeout: 30000 })
    const buf = fs.readFileSync(ogg)
    await sock.sendMessage(chat, { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true } as never, { quoted: quoted as never })
  } catch (e) {
    console.error('[shopagent] voice send failed:', (e as Error).message)
  } finally {
    try { fs.unlinkSync(mp3) } catch {}
    try { fs.unlinkSync(ogg) } catch {}
  }
}

async function sendCatalog(sock: WASocket, biz: BusinessConfig, chat: string, quoted: unknown): Promise<void> {
  const dir = path.join(REPO_ROOT, biz.catalog?.dir || '')
  for (const item of biz.catalog?.items || []) {
    if (!item.img) continue
    const imgPath = path.join(dir, item.img)
    if (!fs.existsSync(imgPath)) continue
    try {
      await sock.sendMessage(chat,
        { image: fs.readFileSync(imgPath), caption: `*${item.name}* — ${biz.name}` } as never,
        { quoted: quoted as never })
      await new Promise(r => setTimeout(r, 800))
    } catch (e) {
      console.error('[shopagent] catalog send failed:', (e as Error).message)
    }
  }
}

// ---------------------------------------------------- config-driven preset brain
// Deterministic fallback when no AI provider answers. All copy comes from the
// business config (biz.preset overrides); defaults are generic.
interface IntentHit { reply: string; catalog?: boolean }

function tmpl(t: string | undefined, vars: Record<string, string>): string {
  let s = t || ''
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v)
  return s
}

function sizesRegex(biz: BusinessConfig): RegExp | null {
  const sizes = biz.facts?.sizes
  if (typeof sizes !== 'string' || !sizes.trim()) return null
  const parts = sizes.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!parts.length) return null
  return new RegExp(`\\b(${parts.join('|')})\\b`)
}

/** Preset-line override: per-business wording, with engine default fallback. */
function presetLine(biz: BusinessConfig, k: string, dflt: string): string {
  return (biz.preset?.[k] as string) ?? dflt
}

export function presetBrain(biz: BusinessConfig, rawText: string, st: ChatState): IntentHit {
  const p = biz.preset || {}
  const t = rawText.toLowerCase().trim()
  const P = (k: string, dflt: string) => p[k] ?? dflt

  // Re-engagement after a graceful exit starts fresh
  if (st.ended && !/^(ok|theek|shukriya|thanks)/.test(t)) {
    const keep = { cart: st.cart, history: st.history, nudgeSent: st.nudgeSent, lastActive: st.lastActive }
    Object.assign(st, freshChatState(), keep)
  }

  const sizeRe = sizesRegex(biz)
  const sizeM = sizeRe ? t.match(sizeRe) : null
  const isNegative = /\b(no|nai|nahi|nahin|not interested|rehne do)\b/.test(t)
  const isGreeting = /^(salam|assalam|aoa|hello|hi|hey|adaab)\b/.test(t)
  const wantsCatalog = /cata|tasveer|taswir|\bpic\b|pics|list|menu|models?/.test(t)
  const asksPrice = /price|rate|kimat|paisay|charges?/.test(t)
  const asksDelivery = /deliver|delivery|cod|cash|payment|advance|bhijwa|pohnch/.test(t)
  const asksAddress = /location|address|shop|dukan|kahan|pata|visit|aana/.test(t)
  const asksWarranty = /warranty|guarantee|granty/.test(t)
  const isThanks = /shukriya|thanks|thank/.test(t)
  const isYes = /^(han|haa|ha|yes|ji|bilkul|zaroor)\b/.test(t)

  const qualifierAsk = P('qualifierAsk', 'Kis cheez me interested hain sir?')
  const greetingAgain = P('greetingAgain', qualifierAsk)
  const thanksLine = P('thanksLine', 'Khush amdeed sir!')
  const fallbackLine = P('fallbackLine', 'Ji sir?')
  const yesContinue = P('yesContinue', 'Ji sir, batayein?')
  const pricePolicy = typeof biz.facts?.pricePolicy === 'string' ? biz.facts.pricePolicy : ''

  // 1. Negative — graceful exit, remember it
  if (isNegative) {
    st.ended = true
    return { reply: biz.exitLine }
  }
  // 2. Catalogue
  if (wantsCatalog) {
    return { reply: biz.catalog?.caption || 'Catalogue bhej raha hun sir:', catalog: true }
  }
  // 3. Qualifier mentioned (e.g. a size)
  if (sizeM) {
    st.qualifier = sizeM[1]
    if (!st.askedCity) {
      st.askedCity = true
      return { reply: tmpl(P('qualifierFoundAsk', '{q} available hai sir. Aap kis sheher se hain?'), { q: sizeM[1] }) }
    }
    return { reply: tmpl(P('rateConfirm', pricePolicy ? '{q} ka fresh rate confirm karke batata hun sir.' : '{q} note kar liya sir.'), { q: sizeM[1] }) }
  }
  // 4. Answering the city question
  if (st.askedCity && !st.ended && t.length > 1 && !t.includes('?')) {
    st.askedCity = false
    const q = st.qualifier ? `${st.qualifier} inch ka` : ''
    return { reply: tmpl(P('cityConfirm', pricePolicy ? 'Shukriya sir, {q} fresh rate confirm karke batata hun.' : 'Shukriya sir, {q} note kar liya.'), { q }) }
  }
  // 5. Price ask
  if (asksPrice) {
    if (!st.askedQualifier) {
      st.askedQualifier = true
      const sizes = typeof biz.facts?.sizes === 'string' ? biz.facts.sizes : ''
      if (sizes) return { reply: tmpl(P('qualifierSizesNote', 'Sizes ye available hain sir: {sizes}. Kis size ka rate chahiye?'), { sizes }) }
      return { reply: qualifierAsk }
    }
    return { reply: P('priceWait', pricePolicy ? 'Fresh rate confirm karke batata hun sir, ek minute.' : 'Ek minute sir, confirm karke batata hun.') }
  }
  // 6. Delivery / address / warranty from facts
  if (asksDelivery && typeof biz.facts?.delivery === 'string') return { reply: biz.facts.delivery }
  if (asksAddress && typeof biz.facts?.address === 'string') return { reply: `Shop ka pata: ${biz.facts.address}` }
  if (asksWarranty && typeof biz.facts?.warranty === 'string') return { reply: biz.facts.warranty }
  // 7. Thanks
  if (isThanks) return { reply: thanksLine }
  // 8. Yes — continue the flow, never re-greet
  if (isYes) {
    if (!st.askedQualifier) {
      st.askedQualifier = true
      return { reply: qualifierAsk }
    }
    return { reply: yesContinue }
  }
  // 9. Greeting — only the full greeting once
  if (isGreeting || !st.greeted) {
    if (!st.greeted) {
      st.greeted = true
      st.askedQualifier = true
      const prompt = P('greetingPrompt', '')
      return { reply: prompt ? `${biz.greeting} ${prompt}` : biz.greeting }
    }
    return { reply: greetingAgain }
  }
  // 10. Fallback — guide forward
  if (!st.askedQualifier) {
    st.askedQualifier = true
    return { reply: qualifierAsk }
  }
  return { reply: fallbackLine }
}

// ------------------------------------------------------------------ cart
export interface CartResult { reply: string; orderPlaced?: { items: CartItem[] } }

export function handleCartText(biz: BusinessConfig, st: ChatState, rawText: string): CartResult | null {
  const t = rawText.toLowerCase().trim()
  const addM = t.match(/^add\s+(.+)/)
  if (addM) {
    const want = addM[1].trim()
    const item = (biz.catalog?.items || []).find(i =>
      i.name.toLowerCase().includes(want) || want.includes(i.name.toLowerCase()) ||
      (i.size && want.includes(i.size)))
    if (!item) return { reply: `Woh item catalogue me nahi mila sir. "catalogue" likhein dekhne ke liye.` }
    const line = st.cart.find(c => c.name === item.name)
    if (line) line.qty += 1
    else st.cart.push({ name: item.name, qty: 1 })
    return { reply: `${item.name} cart me add ho gaya sir. Aur kuch? "cart" likhein dekhne ke liye.` }
  }
  if (/^cart$/.test(t)) {
    if (!st.cart.length) return { reply: 'Cart khaali hai sir.' }
    const lines = st.cart.map((c, i) => `${i + 1}. ${c.name} x${c.qty}`).join('\n')
    return { reply: `Aapka cart:\n${lines}\n\n"checkout" likhein order confirm karne ke liye.` }
  }
  if (/^checkout$/.test(t)) {
    if (!st.cart.length) return { reply: 'Cart khaali hai sir — pehle "add <item>" likhein.' }
    st.checkoutPending = true
    const payments = typeof biz.facts?.payments === 'string' ? biz.facts.payments : 'Payment details owner confirm karein ge.'
    return {
      reply: `Order tayyar hai sir. Payment: ${payments}\n\nPayment karke transaction ID bhej dein.`,
      orderPlaced: { items: [...st.cart] },
    }
  }
  return null
}

// --------------------------------------------------------------- intents
const HANDOFF_RE = /(owner|human|insan|asli (banda|insan)|real (person|human)|talk to|baat kar(ni|wa)|call (me|back|karo)|rabta karo)/i
const BOOK_RE = /\b(book|booking|appointment|slot|reserve|time (chahiye|lena))\b/i
const DEMO_RE = /^(demo|menu|start|shuru)/i
const LEAD_INTEREST_RE = /\b(price|rate|kimat|buy|kharid|order|book|chahiye|interested|quote|estimate)\b/i

function isAfterHours(biz: BusinessConfig): boolean {
  if (!biz.hours?.open || !biz.hours?.close) return false
  try {
    const tz = 'Asia/Karachi'
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()))
    const open = Number(biz.hours.open.split(':')[0])
    const close = Number(biz.hours.close.split(':')[0])
    if (open <= close) return hour < open || hour >= close
    return hour < open && hour >= close
  } catch {
    return false
  }
}

async function notifyOwner(sock: WASocket, biz: BusinessConfig, text: string): Promise<void> {
  const num = (biz.ownerNotify || '').replace(/\D/g, '')
  if (!num) return
  try {
    await sock.sendMessage(`${num}@s.whatsapp.net`, { text: `[${biz.name}] ${text}` })
  } catch (e) {
    console.error('[shopagent] owner notify failed:', (e as Error).message)
  }
}

/** Main entry: answer one customer message in a shop chat. */
export async function handleShopMessage(m: ParsedMessage, sock: WASocket, defaultBiz = 'ta-electronics'): Promise<void> {
  const chat = m.chat
  const bizId = bizForChat(chat, m.sender) || defaultBiz
  const biz = sync.getBusinessConfig(bizId) || loadBusiness(bizId)
  if (!biz) return
  if (!sync.botEnabled(bizId)) return // toggled off from dashboard

  const s = loadState()
  const st = getChatState(s, bizId, chat, m.sender)
  st.lastActive = Date.now()

  let text = (m.body || '').trim()

  // Voice note in: transcribe it first
  if (m.type === 'audioMessage' && m.download) {
    await sock.sendMessage(chat, { react: { text: '🎙️', key: m.key } } as never).catch(() => {})
    const dl = await m.download().catch(() => null)
    if (dl) {
      const heard = await fishAsr(dl.filePath)
      try { fs.unlinkSync(dl.filePath) } catch {}
      if (heard) {
        console.log(`[shopagent:${bizId}] transcribed: ${heard}`)
        text = heard
      } else {
        const fb = presetLine(biz, 'voiceFailLine', 'Voice note mil gaya sir! Transcription filhal available nahi — likh kar bhej dein, foran jawab dunga.')
        await sock.sendMessage(chat, { text: fb }, { quoted: m.message } as never)
        await sendVoiceNote(sock, chat, fb, m.message, getVoiceId(biz))
        return
      }
    }
  }
  if (!text) return

  const phone = digitsOf(m.sender || chat)
  const pushName = m.pushName || ''
  if (/[\u0600-\u06FF]/.test(text)) st.urduScript = true

  void sync.pushMessage(bizId, phone, pushName || undefined, 'in', m.type === 'audioMessage' ? 'voice' : 'text', text)
  void sync.bumpUsage(bizId, 'in')

  const afterHours = isAfterHours(biz)
  let reply = ''
  let wantCatalog = false
  let orderItems: CartItem[] | null = null

  // --- human handoff
  if (HANDOFF_RE.test(text)) {
    reply = (biz.preset?.handoffLine as string) || 'Ji sir, owner ko inform kar diya hai — woh khud rabta karein ge.'
    await notifyOwner(sock, biz, `customer ${phone} (${pushName}) wants to talk: "${text.slice(0, 120)}"`)
  }
  // --- demo menu (agency showcase)
  else if (biz.demoMenu && DEMO_RE.test(text)) {
    reply = presetLine(biz, 'demoMenuText', [
      `Yeh sab try kar sakte hain sir:`,
      `1. Catalogue — "catalogue" likhein`,
      `2. Price maloom karein — koi bhi sawal poochein`,
      `3. Appointment book karein — "book" likhein`,
      `4. Order dein — "add <item>" phir "checkout"`,
      `5. Voice note bhejein — jawab voice me milega`,
      ``,
      `Har feature aapke business ke liye tayyar ho sakta hai.`,
    ].join('\n'))!
  }
  // --- lead capture follow-up
  else if (st.awaitingLead) {
    st.awaitingLead = false
    st.leadSaved = true
    const need = st.history.length ? st.history[st.history.length - 1].text.slice(0, 200) : text.slice(0, 200)
    await sync.pushLead(bizId, { name: pushName || text.slice(0, 60), phone, need, source: 'bot' })
    await notifyOwner(sock, biz, `new lead: ${pushName} (${phone}) — ${need.slice(0, 120)}`)
    reply = presetLine(biz, 'leadThanksLine', 'Shukriya sir! Owner aap se jald rabta karein ge.')!
  }
  // --- appointment booking
  else if (BOOK_RE.test(text) || st.awaitingSlot) {
    if (st.awaitingSlot) {
      st.awaitingSlot = false
      await sync.pushAppointment(bizId, { customer_phone: phone, customer_name: pushName || undefined, slot_text: text.slice(0, 120) })
      await notifyOwner(sock, biz, `appointment request: ${pushName} (${phone}) — "${text.slice(0, 100)}"`)
      reply = tmpl(presetLine(biz, 'bookingDoneLine', 'Appointment request note kar li sir ({slot}). Owner confirm karke batayein ge.'), { slot: text.slice(0, 60) })
    } else {
      st.awaitingSlot = true
      reply = presetLine(biz, 'bookingAskLine', 'Zaroor sir! Kis din aur time chahiye?')!
    }
  }
  // --- cart / checkout
  else if (/^(add\s|cart|checkout$)/i.test(text)) {
    const cr = handleCartText(biz, st, text)
    if (cr) {
      reply = cr.reply
      if (cr.orderPlaced) {
        orderItems = cr.orderPlaced.items
        await sync.pushOrder(bizId, { customer_phone: phone, items: cr.orderPlaced.items })
        await notifyOwner(sock, biz, `new order from ${pushName} (${phone}): ${cr.orderPlaced.items.map(i => `${i.name} x${i.qty}`).join(', ')}`)
        st.cart = []
      }
    }
  }
  // --- lead interest trigger
  else if (LEAD_INTEREST_RE.test(text) && !st.leadSaved && !st.awaitingLead) {
    st.awaitingLead = true
    reply = (biz.preset?.leadAsk as string) || 'Apna naam bata dein sir taake owner aap se rabta kar sake.'
  }
  // --- brain (AI) with preset fallback
  else {
    const history: Turn[] = st.history.slice(-(biz.brain?.maxTurns ?? 12))
    const ai = await brainAnswer(biz, history, text).catch(() => null)
    if (ai) {
      reply = ai
      wantCatalog = /catalogue bhej/i.test(ai)
    } else {
      const hit = presetBrain(biz, text, st)
      reply = hit.reply
      wantCatalog = !!hit.catalog
    }
  }

  if (!reply) return

  // FAQ learning: generic fallback twice in a row -> flag for owner
  const genericFallback = reply === ((biz.preset?.fallbackLine as string) || 'Ji sir?')
  if (genericFallback) {
    st.fallbackStreak += 1
    if (st.fallbackStreak >= 2) {
      st.fallbackStreak = 0
      await sync.learnFaq(bizId, text)
      await notifyOwner(sock, biz, `couldn't answer (${phone}): "${text.slice(0, 120)}" — flagged for FAQ`)
    }
  } else {
    st.fallbackStreak = 0
  }

  // After-hours: answer, but take a message for the morning
  if (afterHours) {
    const open = biz.hours?.open || ''
    const close = biz.hours?.close || ''
    reply = `${reply}\n\n${tmpl(presetLine(biz, 'afterHoursLine', 'Note: hum is waqt band hain ({open}–{close}). Subah owner khud jawab dein ge.'), { open, close })}`
    await sync.pushLead(bizId, { name: pushName || phone, phone, need: `after-hours: ${text.slice(0, 200)}`, source: 'bot' })
  }

  // Review collector: warm thanks -> ask for a review
  if (/\b(shukriya|thanks|thank you|bohat (ach|khoob)|great|awesome)\b/i.test(text) && biz.reviewLink) {
    reply = `${reply}\n\n${tmpl(presetLine(biz, 'reviewAskLine', 'Khushi hui sir! Agar waqt ho to Google par review de dein: {link}'), { link: biz.reviewLink })}`
  }

  const isFirstContact = st.history.length === 0
  st.history.push({ role: 'user', text: text.slice(0, 500) }, { role: 'assistant', text: reply.slice(0, 500) })
  const maxTurns = (biz.brain?.maxTurns ?? 12) * 2
  if (st.history.length > maxTurns) st.history = st.history.slice(-maxTurns)
  saveState(s)

  // Welcome image: first contact gets the business's brand image with the greeting as caption
  const welcomePath = isFirstContact && biz.welcomeImage ? path.join(REPO_ROOT, biz.welcomeImage) : ''
  if (welcomePath && fs.existsSync(welcomePath)) {
    await sock.sendMessage(chat,
      { image: fs.readFileSync(welcomePath), caption: reply } as never,
      { quoted: m.message } as never).catch(() => sock.sendMessage(chat, { text: reply }, { quoted: m.message } as never))
  } else {
    await sock.sendMessage(chat, { text: reply }, { quoted: m.message } as never)
  }
  const minChars = biz.voice?.minCharsForVoiceNote ?? 25
  if (stripFormat(reply).length > minChars) {
    await sendVoiceNote(sock, chat, reply, m.message, getVoiceId(biz))
  }
  if (wantCatalog) await sendCatalog(sock, biz, chat, m.message)

  void sync.pushMessage(bizId, phone, pushName || undefined, 'out', 'text', reply)
  void sync.bumpUsage(bizId, 'out')
}

/** One gentle nudge per chat after 24h of silence mid-flow. Call on an interval. */
export async function sendDueNudges(sock: WASocket): Promise<number> {
  const s = loadState()
  const now = Date.now()
  let sent = 0
  for (const [bizId, b] of Object.entries(s.businesses)) {
    const biz = sync.getBusinessConfig(bizId) || loadBusiness(bizId)
    if (!biz || biz.nudges !== true) continue
    for (const [key, st] of Object.entries(b.states)) {
      if (st.nudgeSent || st.ended || !st.greeted) continue
      const midFlow = st.qualifier || st.cart.length > 0 || st.awaitingSlot || st.checkoutPending
      if (!midFlow) continue
      if (now - st.lastActive < 24 * 3600 * 1000) continue
      st.nudgeSent = true
      try {
        const chat = b.chats.find(c => digitsOf(c) === key) || `${key}@s.whatsapp.net`
        await sock.sendMessage(chat, { text: (biz.preset?.nudgeLine as string) || 'Assalamualaikum sir! Kal baat adhuri reh gayi thi — koi madad chahiye to batayein.' })
        sent += 1
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) {
        console.error('[shopagent] nudge failed:', (e as Error).message)
      }
    }
  }
  if (sent) saveState(s)
  return sent
}

/** Owner broadcast to recent customer chats (max 30, 2s apart). */
export async function runBroadcast(sock: WASocket, bizId: string, text: string): Promise<number> {
  const s = loadState()
  const b = s.businesses[bizId]
  if (!b) return 0
  const now = Date.now()
  const targets = b.chats.filter(c => {
    const st = b.states[digitsOf(c)]
    return st && !st.ended && now - st.lastActive < 30 * 24 * 3600 * 1000
  }).slice(0, 30)
  let sent = 0
  for (const c of targets) {
    try {
      await sock.sendMessage(c, { text })
      sent += 1
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) {
      console.error('[shopagent] broadcast send failed:', (e as Error).message)
    }
  }
  await sync.recordBroadcast(bizId, text, sent)
  return sent
}

/**
 * Agency/owner broadcast loop: sends every queued dashboard broadcast
 * through the bot, then marks it sent. Called on an interval.
 */
export async function processQueuedBroadcasts(sock: WASocket): Promise<number> {
  const queued = await sync.fetchQueuedBroadcasts()
  let done = 0
  for (const q of queued) {
    if (!sync.botEnabled(q.business_id)) {
      await sync.markBroadcastSent(q.id, 0)
      continue
    }
    try {
      const sent = await runBroadcast(sock, q.business_id, q.message)
      await sync.markBroadcastSent(q.id, sent)
      console.log(`[shopagent] broadcast ${q.id} -> ${q.business_id}: ${sent} sent`)
      done += 1
    } catch (e) {
      console.error('[shopagent] queued broadcast failed:', (e as Error).message)
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  return done
}
