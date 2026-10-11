// src/lib/shopBrain.ts — conversational brain for ShopAgent businesses.
// Provider chain: Anthropic (Claude) -> NVIDIA NIM -> null (caller falls back
// to the config-driven preset brain). The system prompt is built ONLY from the
// business config: the brain may never invent prices, sizes, addresses or facts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..')

export interface CatalogItem {
  name: string
  size?: string
  img?: string
}

export interface BusinessConfig {
  id: string
  name: string
  language: string
  tone: string
  greeting: string
  exitLine: string
  welcomeImage?: string
  safety?: {
    dailyProactiveCap?: number
    broadcastMax?: number
    broadcastCooldownHrs?: number
    replyDelayMinMs?: number
    replyDelayMaxMs?: number
    broadcastDelayMinMs?: number
    broadcastDelayMaxMs?: number
  }
  city?: string
  ownerNotify?: string
  reviewLink?: string
  hours?: { open: string; close: string }
  nudges?: boolean
  demoMenu?: boolean
  facts: Record<string, string | string[] | undefined>
  catalog: { dir: string; caption: string; items: CatalogItem[] }
  voice: { voiceId?: string; minCharsForVoiceNote: number }
  brain: { provider: string; maxTokens: number; temperature: number; maxTurns: number }
  preset?: Record<string, string | undefined>
}

export interface Turn {
  role: 'user' | 'assistant'
  text: string
}

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(REPO_ROOT, 'data')
}

export function loadBusiness(id: string): BusinessConfig | null {
  try {
    const raw = fs.readFileSync(path.join(dataDir(), 'businesses', `${id}.json`), 'utf8')
    const cfg = JSON.parse(raw) as BusinessConfig
    if (!cfg || cfg.id !== id) return null
    return cfg
  } catch {
    return null
  }
}

export function listBusinesses(): string[] {
  try {
    return fs
      .readdirSync(path.join(dataDir(), 'businesses'))
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
  } catch {
    return []
  }
}

function factLine(key: string, v: string | string[] | undefined): string {
  if (v === undefined) return ''
  return `- ${key}: ${Array.isArray(v) ? v.join(', ') : v}`
}

/** System prompt built exclusively from the business config. */
export function buildSystemPrompt(biz: BusinessConfig): string {
  const skip = new Set(['id', 'name', 'language', 'tone'])
  const facts = Object.entries(biz.facts || {})
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => factLine(k, v))
    .filter(Boolean)
    .join('\n')
  const catalogNames = (biz.catalog?.items || []).map(i => i.name).join(', ') || 'none listed'

  return `You are the WhatsApp assistant for ${biz.name}. Tone: ${biz.tone || 'warm, respectful, never pushy'}.
Language: reply in ${biz.language === 'roman-urdu' ? 'Roman Urdu (Urdu written in Latin script)' : biz.language}. Keep every message short: 1-3 lines max.

BUSINESS FACTS (use ONLY these — never invent a price, size, address, date or fact):
${facts || '- (no facts configured)'}
- Catalogue items: ${catalogNames}
${biz.hours ? `- Hours: ${biz.hours.open} to ${biz.hours.close}` : ''}

HOW TO TALK:
- Adapt to the visitor. Read what they actually said and respond to THAT first — never drag them back to a script. If they ask something specific, answer it, then one gentle follow-up.
- Match their language: if they write in English, reply in English; if Roman Urdu, reply in Roman Urdu; if Urdu script, reply in Urdu script. Default to the business's configured language.
- You are demoing the product by being the product: sharp, natural, human — like a founder showing his own work, never a call center.
- Greet once per conversation with: "${biz.greeting}". Never greet again.
- Qualify gently: ask ONE thing at a time, conversationally, never as a list.
- NEVER repeat a question you already asked in this conversation.
- Answer what the customer asked. At most one follow-up question after an answer.
- If the customer says no / nahi / not interested: reply exactly "${biz.exitLine}" and stop. No pushing, no follow-ups.
- Prices: follow the pricePolicy fact strictly. If it says rates change or to confirm, never invent a rupee amount.
- If they ask for catalogue/pictures: reply with the catalogue caption intent — say "${biz.catalog?.caption || 'Catalogue bhej raha hun.'}" (the app sends the images).
- If you cannot answer from the facts above, say you will check with the owner — never guess.
- Keep it human. No robotic repetition.`
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'

async function callAnthropic(biz: BusinessConfig, history: Turn[], userText: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
  const messages = [
    ...history.slice(-(biz.brain?.maxTurns ?? 12)).map(t => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: t.text.slice(0, 800),
    })),
    { role: 'user', content: userText.slice(0, 800) },
  ]
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: biz.brain?.maxTokens ?? 200,
        temperature: biz.brain?.temperature ?? 0.7,
        system: buildSystemPrompt(biz),
        messages,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.error('[shopbrain] anthropic http', res.status)
      return null
    }
    const d = (await res.json()) as { content?: { type?: string; text?: string }[] }
    const text = (d.content || []).find(c => c.type === 'text')?.text?.trim()
    return text || null
  } catch (e) {
    console.error('[shopbrain] anthropic failed:', (e as Error).message)
    return null
  }
}

async function callNim(biz: BusinessConfig, history: Turn[], userText: string): Promise<string | null> {
  const key = process.env.NVIDIA_NIM_API_KEY
  if (!key) return null
  const model = process.env.NIM_MODEL || 'meta/llama-3.2-11b-vision-instruct'
  const messages = [
    { role: 'system', content: buildSystemPrompt(biz) },
    ...history.slice(-(biz.brain?.maxTurns ?? 12)).map(t => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: t.text.slice(0, 800),
    })),
    { role: 'user', content: userText.slice(0, 800) },
  ]
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: biz.brain?.maxTokens ?? 200,
        temperature: biz.brain?.temperature ?? 0.7,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.error('[shopbrain] nim http', res.status)
      return null
    }
    const d = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return d.choices?.[0]?.message?.content?.trim() || null
  } catch (e) {
    console.error('[shopbrain] nim failed:', (e as Error).message)
    return null
  }
}

/**
 * Try the provider chain. Returns the reply text, or null when no provider
 * answered (caller should use the preset brain fallback).
 */
export async function brainAnswer(
  biz: BusinessConfig,
  history: Turn[],
  userText: string,
): Promise<string | null> {
  const provider = (biz.brain?.provider || 'auto').toLowerCase()
  if (provider === 'auto' || provider === 'anthropic') {
    const a = await callAnthropic(biz, history, userText)
    if (a) return a
    if (provider === 'anthropic') return null
  }
  if (provider === 'auto' || provider === 'nim') {
    const n = await callNim(biz, history, userText)
    if (n) return n
  }
  return null
}
