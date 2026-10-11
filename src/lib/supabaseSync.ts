// src/lib/supabaseSync.ts — bridge between the WhatsApp bot and Supabase.
// The VM cannot take inbound connections, so Supabase is the shared backend:
// the bot pushes chats/leads/orders and pulls config + bot_enabled toggles.
// Without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY the bot runs in local
// mode (configs from data/businesses/*.json, no remote sync) and logs once.
import { loadBusiness, listBusinesses, type BusinessConfig } from './shopBrain.js'

interface RemoteBiz {
  config: BusinessConfig
  bot_enabled: boolean
}

let warned = false
let remoteCache: Record<string, RemoteBiz> = {}
let lastPull = 0

function creds(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) {
    if (!warned) {
      warned = true
      console.log('[supasync] no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — running in local JSON mode')
    }
    return null
  }
  return { url, key }
}

export function isRemote(): boolean {
  return creds() !== null
}

async function req(
  method: string,
  tablePath: string,
  body?: unknown,
  extra?: Record<string, string>,
): Promise<unknown> {
  const c = creds()
  if (!c) return null
  const res = await fetch(`${c.url}/rest/v1/${tablePath}`, {
    method,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json',
      ...(extra || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`[supasync] ${method} ${tablePath} -> ${res.status}`)
    return null
  }
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const enc = encodeURIComponent

/** Pull businesses (id, config, bot_enabled). Remote config wins over local. */
export async function pullBusinesses(): Promise<Record<string, RemoteBiz>> {
  const c = creds()
  if (!c) return {}
  try {
    const rows = (await req('GET', 'businesses?select=id,config,bot_enabled')) as
      | { id: string; config: BusinessConfig; bot_enabled: boolean }[]
      | null
    if (!rows) return remoteCache
    const map: Record<string, RemoteBiz> = {}
    for (const r of rows) map[r.id] = { config: r.config, bot_enabled: r.bot_enabled }
    remoteCache = map
    lastPull = Date.now()
    return map
  } catch (e) {
    console.error('[supasync] pullBusinesses failed:', (e as Error).message)
    return remoteCache
  }
}

/** Effective business config: remote wins, local JSON is the fallback. */
export function getBusinessConfig(id: string): BusinessConfig | null {
  const remote = remoteCache[id]
  if (remote?.config) return remote.config
  return loadBusiness(id)
}

/** All known business ids (remote union local). */
export function allBusinessIds(): string[] {
  const ids = new Set<string>([...listBusinesses(), ...Object.keys(remoteCache)])
  return [...ids]
}

/** bot_enabled per business (remote only; local businesses are always enabled). */
export function botEnabled(id: string): boolean {
  const remote = remoteCache[id]
  if (remote) return remote.bot_enabled !== false
  return true
}

/** Refresh toggle cache every 60s. Non-blocking; safe to call once at startup. */
export function startPolling(): void {
  if (!creds()) return
  const tick = () => pullBusinesses().catch(() => {})
  void tick()
  setInterval(tick, 60000)
  console.log('[supasync] toggle polling every 60s')
}

async function ensureConversation(bizId: string, phone: string, name?: string): Promise<string | null> {
  try {
    const found = (await req(
      'GET',
      `conversations?business_id=eq.${enc(bizId)}&customer_phone=eq.${enc(phone)}&status=eq.open&order=last_message_at.desc&limit=1`,
    )) as { id: string }[] | null
    if (found && found[0]) {
      await req('PATCH', `conversations?id=eq.${found[0].id}`, {
        last_message_at: new Date().toISOString(),
        ...(name ? { customer_name: name } : {}),
      })
      return found[0].id
    }
    const created = (await req(
      'POST',
      'conversations',
      { business_id: bizId, customer_phone: phone, customer_name: name || null },
      { Prefer: 'return=representation' },
    )) as { id: string }[] | null
    return created?.[0]?.id || null
  } catch (e) {
    console.error('[supasync] ensureConversation failed:', (e as Error).message)
    return null
  }
}

export async function pushMessage(
  bizId: string,
  phone: string,
  name: string | undefined,
  direction: 'in' | 'out',
  kind: string,
  body: string,
): Promise<void> {
  if (!creds()) return
  try {
    const convId = await ensureConversation(bizId, phone, name)
    if (!convId) return
    await req('POST', 'messages', {
      business_id: bizId,
      conversation_id: convId,
      direction,
      kind,
      body: (body || '').slice(0, 4000) || null,
    })
  } catch (e) {
    console.error('[supasync] pushMessage failed:', (e as Error).message)
  }
}

export async function pushLead(
  bizId: string,
  lead: { name?: string; phone?: string; business_type?: string; need?: string; source?: string },
): Promise<void> {
  if (!creds()) return
  try {
    await req('POST', 'leads', { business_id: bizId, source: 'bot', ...lead })
  } catch (e) {
    console.error('[supasync] pushLead failed:', (e as Error).message)
  }
}

export async function pushAppointment(
  bizId: string,
  appt: { customer_phone: string; customer_name?: string; service?: string; slot_text?: string },
): Promise<void> {
  if (!creds()) return
  try {
    await req('POST', 'appointments', {
      business_id: bizId,
      customer_phone: appt.customer_phone,
      customer_name: appt.customer_name || null,
      service: appt.slot_text ? `${appt.service || 'appointment'} — ${appt.slot_text}` : appt.service || null,
    })
  } catch (e) {
    console.error('[supasync] pushAppointment failed:', (e as Error).message)
  }
}

export async function pushOrder(
  bizId: string,
  order: { customer_phone: string; items: { name: string; qty: number }[]; total_note?: string },
): Promise<string | null> {
  if (!creds()) return null
  try {
    const created = (await req(
      'POST',
      'orders',
      { business_id: bizId, customer_phone: order.customer_phone, items: order.items, total_note: order.total_note || null },
      { Prefer: 'return=representation' },
    )) as { id: string }[] | null
    return created?.[0]?.id || null
  } catch (e) {
    console.error('[supasync] pushOrder failed:', (e as Error).message)
    return null
  }
}

export async function pushReview(
  bizId: string,
  review: { customer_phone?: string; rating?: number; text?: string },
): Promise<void> {
  if (!creds()) return
  try {
    await req('POST', 'reviews', { business_id: bizId, ...review })
  } catch (e) {
    console.error('[supasync] pushReview failed:', (e as Error).message)
  }
}

export async function recordBroadcast(bizId: string, message: string, audience: number): Promise<void> {
  if (!creds()) return
  try {
    await req('POST', 'broadcasts', {
      business_id: bizId,
      message: message.slice(0, 2000),
      audience_count: audience,
      status: 'sent',
    })
  } catch (e) {
    console.error('[supasync] recordBroadcast failed:', (e as Error).message)
  }
}

/** Store an unanswered question so the owner can teach the bot once. */
export async function learnFaq(bizId: string, question: string): Promise<void> {
  if (!creds()) return
  try {
    await req('POST', 'faqs', {
      business_id: bizId,
      question: question.slice(0, 500),
      answer: '',
      learned: false,
    })
  } catch (e) {
    console.error('[supasync] learnFaq failed:', (e as Error).message)
  }
}

/** Increment today's usage counters (read-modify-write; fine for v1 volumes). */
export async function bumpUsage(bizId: string, direction: 'in' | 'out'): Promise<void> {
  if (!creds()) return
  try {
    const day = new Date().toISOString().slice(0, 10)
    const rows = (await req(
      'GET',
      `usage_daily?business_id=eq.${enc(bizId)}&day=eq.${day}&limit=1`,
    )) as { messages_in: number; messages_out: number }[] | null
    if (rows && rows[0]) {
      const patch =
        direction === 'in'
          ? { messages_in: rows[0].messages_in + 1 }
          : { messages_out: rows[0].messages_out + 1 }
      await req('PATCH', `usage_daily?business_id=eq.${enc(bizId)}&day=eq.${day}`, patch)
    } else {
      await req('POST', 'usage_daily', {
        business_id: bizId,
        day,
        messages_in: direction === 'in' ? 1 : 0,
        messages_out: direction === 'out' ? 1 : 0,
      })
    }
  } catch (e) {
    console.error('[supasync] bumpUsage failed:', (e as Error).message)
  }
}
