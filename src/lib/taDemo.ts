// src/lib/taDemo.ts — T&A Electronics demo mode for the +27 instance.
// When a DM chat is marked as a demo chat (via !tademo on), every
// non-command message from the customer is answered as the shop's
// voice agent: text reply + Fish Audio voice note, catalogue images,
// and Fish Audio transcription of incoming voice notes.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WASocket } from '@whiskeysockets/baileys'
import type { ParsedMessage } from '../core/types.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..')

const FISH_DIR = path.join(process.env.HOME ?? '/home/hatch', 'workspace/skills/fish-audio/bin')
const TTS_CLI = path.join(FISH_DIR, 'fish-tts')
const ASR_CLI = path.join(FISH_DIR, 'fish-asr')
const CATALOG_DIR = path.join(REPO_ROOT, 'assets', 'ta-catalog')
const TMP_DIR = path.join(REPO_ROOT, 'tmp', 'ta-demo')

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(REPO_ROOT, 'data')
}
function stateFile(): string {
  return path.join(dataDir(), 'ta-demo.json')
}

interface TaDemoState { chats: string[]; voiceId?: string }

function loadState(): TaDemoState {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8')
    const s = JSON.parse(raw)
    return { chats: Array.isArray(s.chats) ? s.chats : [], voiceId: s.voiceId }
  } catch {
    return { chats: [] }
  }
}

function saveState(s: TaDemoState): void {
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
  fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2))
}

function getVoiceId(): string | undefined {
  return loadState().voiceId || process.env.FISH_VOICE_ID || undefined
}

function digitsOf(jid: string): string {
  return (jid || '').replace(/\D/g, '')
}

export function isTaDemoChat(chat: string, sender?: string): boolean {
  const chats = loadState().chats
  const targets: string[] = [chat, sender].filter((x): x is string => !!x).map(digitsOf)
  return chats.some(c => targets.includes(digitsOf(c)))
}

export function setTaDemoChat(chat: string, on: boolean): void {
  const s = loadState()
  if (on && !s.chats.includes(chat)) s.chats.push(chat)
  if (!on) s.chats = s.chats.filter(c => c !== chat)
  saveState(s)
}

export function setTaDemoVoice(voiceId: string): void {
  const s = loadState()
  s.voiceId = voiceId
  saveState(s)
}

export function listTaDemoChats(): string[] {
  return loadState().chats
}

// ---------------------------------------------------------------- catalog
interface Product {
  size: string
  name: string
  img?: string
}

const PRODUCTS: Product[] = [
  { size: '32', name: '32 inch LED', img: 'tv1.jpg' },
  { size: '43', name: '43 inch LED', img: 'tv2.jpg' },
  { size: '55', name: '55 inch LED', img: 'tv3.jpg' },
]

const ALL_SIZES = '19, 22, 24, 32, 40, 43, 50, 55, 60, 65, 70, 75, 85, 105'

const SHOP_LINE = '25-G Gohar Centre, Muslim Town Mor, Wahdat Road, Near Butt Sweets, Lahore'

// ------------------------------------------------------------ fish audio
async function fishTts(text: string, outMp3: string): Promise<boolean> {
  try {
    const args = ['--out', outMp3, '--text', text]
    const vid = getVoiceId()
    if (vid) args.push('--voice-id', vid)
    await execFileAsync(TTS_CLI, args, { timeout: 90000 })
    return fs.existsSync(outMp3) && fs.statSync(outMp3).size > 1000
  } catch (e) {
    console.error('[tademo] tts failed:', (e as Error).message)
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
    console.error('[tademo] asr failed:', (e as Error).message)
    return null
  }
}

function stripFormat(s: string): string {
  return s.replace(/\*/g, '').replace(/<[^>]*>/g, '')
}

async function sendVoiceNote(sock: WASocket, chat: string, text: string, quoted: unknown): Promise<void> {
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const mp3 = path.join(TMP_DIR, `tts-${Date.now()}.mp3`)
  const ogg = path.join(TMP_DIR, `tts-${Date.now()}.ogg`)
  try {
    const ok = await fishTts(stripFormat(text).slice(0, 600), mp3)
    if (!ok) return
    await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-c:a', 'libopus', '-b:a', '32k', ogg], { timeout: 30000 })
    const buf = fs.readFileSync(ogg)
    await sock.sendMessage(chat, { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true } as never, { quoted: quoted as never })
  } catch (e) {
    console.error('[tademo] voice send failed:', (e as Error).message)
  } finally {
    try { fs.unlinkSync(mp3) } catch {}
    try { fs.unlinkSync(ogg) } catch {}
  }
}

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const NIM_MODEL = process.env.NIM_MODEL || 'meta/llama-3.2-11b-vision-instruct'

const SHOP_SYSTEM = `You are the WhatsApp assistant for T&A Electronics, Lahore. You talk like the shop owner: respectful, warm, never pushy. Short Roman Urdu messages, 1-3 lines max.

SHOP FACTS (use only these, never invent):
- Sizes available (inch): 19, 22, 24, 32, 40, 43, 50, 55, 60, 65, 70, 75, 85, 105
- Delivery: Lahore same day, plus other cities
- Address: 25-G Gohar Centre, Muslim Town Mor, Wahdat Road, Near Butt Sweets, Lahore
- Numbers: 0333-4804778, 0321-4495144
- WhatsApp discount channel: T&A ELECTRONICS

HOW TO TALK (like the owner):
- Greet once per conversation: "Assalamualaikum! T&A Electronics se rabta karne ka shukriya."
- Then qualify gently: which size LED are they looking for? which city are they from? Ask ONE thing at a time, conversationally, not as a list.
- Answer what they asked. At most one follow-up question after an answer.
- NEVER repeat a question you already asked. NEVER ask "LED TV chahiye?" twice.
- If they say no / nai / not interested: reply "Koi baat nahi sir, jab zaroorat ho rabta kijiye ga." and stop. No pushing, no follow-ups.
- Prices: rates change daily. If they ask a price, ask which size, then say fresh rate confirm karke batayein ge. Never invent a rupee amount.
- If they ask for catalogue/pictures: say "Catalogue bhej raha hun sir." (the app sends the images)
- Keep it human. No robotic repetition.`

async function aiAnswer(userText: string): Promise<string | null> {
  const key = process.env.NVIDIA_NIM_API_KEY
  if (!key) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: [
          { role: 'system', content: SHOP_SYSTEM },
          { role: 'user', content: userText.slice(0, 500) },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.error('[tademo] nim http', res.status)
      return null
    }
    const d = await res.json() as { choices?: { message?: { content?: string } }[] }
    const text = d.choices?.[0]?.message?.content?.trim()
    return text || null
  } catch (e) {
    console.error('[tademo] nim failed:', (e as Error).message)
    return null
  }
}

// --------------------------------------------------------------- brain
interface ChatState {
  greeted: boolean
  askedSize: boolean
  askedCity: boolean
  size?: string
  ended: boolean
}

function freshState(): ChatState {
  return { greeted: false, askedSize: false, askedCity: false, ended: false }
}

function stateKey(chat: string, sender?: string): string {
  return digitsOf(sender || chat)
}

function getChatState(chat: string, sender?: string): ChatState {
  const s = loadState()
  const k = stateKey(chat, sender)
  const states = (s as TaDemoState & { states?: Record<string, ChatState> }).states || {}
  if (!states[k]) {
    states[k] = freshState()
    ;(s as TaDemoState & { states?: Record<string, ChatState> }).states = states
    saveState(s)
  }
  return states[k]
}

function saveChatState(chat: string, sender: string | undefined, st: ChatState): void {
  const s = loadState()
  const ext = s as TaDemoState & { states?: Record<string, ChatState> }
  ext.states = ext.states || {}
  ext.states[stateKey(chat, sender)] = st
  saveState(s)
}

// ------------------------------------------------- stateful preset brain
// Deterministic, remembers the conversation. Intents are a flat list —
// to add a new one, append { name, test, handle } below.
interface IntentHit { reply: string; catalog?: boolean }

const SIZE_RE = /\b(19|22|24|32|40|43|50|55|60|65|70|75|85|105)\b/

export function presetBrain(rawText: string, st: ChatState): IntentHit {
  const t = rawText.toLowerCase().trim()

  // Re-engagement after a graceful exit starts fresh
  if (st.ended && !/^(ok|theek|shukriya|thanks)/.test(t)) {
    Object.assign(st, freshState())
  }

  const sizeM = t.match(SIZE_RE)
  const isNegative = /\b(no|nai|nahi|nahin|not interested|rehne do)\b/.test(t)
  const isGreeting = /^(salam|assalam|aoa|hello|hi|hey|adaab)\b/.test(t)
  const wantsCatalog = /cata|tasveer|taswir|\bpic\b|pics|list|menu|models?/.test(t)
  const asksPrice = /price|rate|kimat|paisay|charges?/.test(t)
  const asksDelivery = /deliver|delivery|cod|cash|payment|advance|bhijwa|pohnch/.test(t)
  const asksAddress = /location|address|shop|dukan|kahan|pata|visit|aana/.test(t)
  const asksWarranty = /warranty|guarantee|granty/.test(t)
  const isThanks = /shukriya|thanks|thank/.test(t)
  const isYes = /^(han|haa|ha|yes|ji|bilkul|zaroor)\b/.test(t)

  // 1. Negative — graceful exit, remember it
  if (isNegative) {
    st.ended = true
    return { reply: 'Koi baat nahi sir, jab zaroorat ho rabta kijiye ga.' }
  }
  // 2. Catalogue
  if (wantsCatalog) {
    return { reply: 'Catalogue bhej raha hun sir:', catalog: true }
  }
  // 3. Size mentioned
  if (sizeM) {
    st.size = sizeM[1]
    if (!st.askedCity) {
      st.askedCity = true
      return { reply: `${sizeM[1]} inch available hai sir. Aap kis sheher se hain?` }
    }
    return { reply: `${sizeM[1]} inch ka fresh rate confirm karke batata hun sir.` }
  }
  // 4. Answering the city question (askedCity and not a question itself)
  if (st.askedCity && !st.ended && t.length > 1 && !t.includes('?')) {
    st.askedCity = false // answered
    const sizeTxt = st.size ? `${st.size} inch ka` : 'LED ka'
    return { reply: `Shukriya sir, ${sizeTxt} fresh rate confirm karke batata hun.` }
  }
  // 5. Price ask
  if (asksPrice) {
    if (!st.askedSize) {
      st.askedSize = true
      return { reply: `Sizes ye available hain sir: ${ALL_SIZES}. Kis size ka rate chahiye?` }
    }
    return { reply: 'Fresh rate confirm karke batata hun sir, ek minute.' }
  }
  // 6. Delivery / address / warranty
  if (asksDelivery) return { reply: 'Lahore me same day delivery hai sir, aur bahar sheher bhi bhejte hain.' }
  if (asksAddress) return { reply: `Shop ka pata: ${SHOP_LINE}` }
  if (asksWarranty) return { reply: 'Har LED par warranty milti hai sir.' }
  // 7. Thanks
  if (isThanks) return { reply: 'Khush amdeed sir!' }
  // 8. Yes — continue the flow, never re-greet
  if (isYes) {
    if (!st.askedSize) {
      st.askedSize = true
      return { reply: 'Kis size ki LED dekh rahe hain sir?' }
    }
    return { reply: 'Ji sir, batayein?' }
  }
  // 9. Greeting — only the full greeting once
  if (isGreeting) {
    if (!st.greeted) {
      st.greeted = true
      st.askedSize = true
      return { reply: 'Assalamualaikum! T&A Electronics se rabta karne ka shukriya sir. Catalogue dekhne ke liye "catalogue" likhein, ya batayein kis size ki LED chahiye?' }
    }
    return { reply: 'Ji sir, kis size ki LED dekh rahe hain?' }
  }
  // 10. Fallback — guide forward, never repeat the greeting
  if (!st.greeted) {
    st.greeted = true
    st.askedSize = true
    return { reply: 'Assalamualaikum! T&A Electronics se rabta karne ka shukriya sir. Catalogue dekhne ke liye "catalogue" likhein, ya batayein kis size ki LED chahiye?' }
  }
  if (!st.askedSize) {
    st.askedSize = true
    return { reply: 'Kis size ki LED dekh rahe hain sir?' }
  }
  return { reply: 'Ji sir?' }
}

async function sendCatalog(sock: WASocket, chat: string, quoted: unknown): Promise<void> {
  for (const p of PRODUCTS.filter(p => p.img)) {
    const imgPath = path.join(CATALOG_DIR, p.img!)
    if (!fs.existsSync(imgPath)) continue
    try {
      await sock.sendMessage(chat,
        { image: fs.readFileSync(imgPath), caption: `*${p.name}* — T&A Electronics` } as never,
        { quoted: quoted as never })
      await new Promise(r => setTimeout(r, 800))
    } catch (e) {
      console.error('[tademo] catalog send failed:', (e as Error).message)
    }
  }
}

/** Main entry: answer one customer message in a demo chat. */
export async function handleTaDemoMessage(m: ParsedMessage, sock: WASocket): Promise<void> {
  const chat = m.chat
  let text = (m.body || '').trim()

  // Voice note in: transcribe it first
  if (m.type === 'audioMessage' && m.download) {
    await sock.sendMessage(chat, { react: { text: '🎙️', key: m.key } } as never).catch(() => {})
    const dl = await m.download().catch(() => null)
    if (dl) {
      const heard = await fishAsr(dl.filePath)
      try { fs.unlinkSync(dl.filePath) } catch {}
      if (heard) {
        console.log(`[tademo] transcribed: ${heard}`)
        text = heard
      } else {
        const fb = 'Voice note mil gaya sir! Fish Audio ka transcription credit khatam hai — likh kar bhej dein, foran jawab dunga.'
        await sock.sendMessage(chat, { text: fb }, { quoted: m.message } as never)
        await sendVoiceNote(sock, chat, fb, m.message)
        return
      }
    }
  }

  if (!text) return
  const st = getChatState(chat, m.sender)
  const { reply, catalog: wantCatalog } = presetBrain(text, st)
  saveChatState(chat, m.sender, st)
  await sock.sendMessage(chat, { text: reply }, { quoted: m.message } as never)
  // Voice note only for substantive answers, not one-word replies
  if (stripFormat(reply).length > 25) {
    await sendVoiceNote(sock, chat, reply, m.message)
  }
  if (wantCatalog) await sendCatalog(sock, chat, m.message)
}
