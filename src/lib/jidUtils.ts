import { jidDecode } from '@whiskeysockets/baileys'
import type { WAMessage, WASocket, GroupParticipant } from '@whiskeysockets/baileys'

/**
 * jidUtils — the LID/PN identity fix.
 *
 * WhatsApp now addresses many users by LID (e.g. `23277710033892@lid`)
 * instead of their phone-number JID (`923164413714@s.whatsapp.net`).
 * The two forms refer to the same person, and Baileys hands us a mix of
 * both depending on the message, the group, and the addressing mode.
 * Everything here canonicalizes identities to the PN form so that tags,
 * bans, warns, profiles and admin checks follow the person, not the
 * address form.
 */

export const isLidJid = (jid: string | undefined | null): jid is string =>
  !!jid && jid.endsWith('@lid')

export const isPnJid = (jid: string | undefined | null): jid is string =>
  !!jid && jid.endsWith('@s.whatsapp.net')

/** '923164413714:0@s.whatsapp.net' -> '923164413714' (strip @domain and :device) */
export function bareUser(jid: string): string {
  return (jid.split('@')[0] ?? '').split(':')[0] ?? ''
}

/** -> '<digits>@s.whatsapp.net' */
export function normalizePn(jid: string): string {
  return `${bareUser(jid).replace(/\D/g, '')}@s.whatsapp.net`
}

/** bareUser stripped of non-digits */
export function digitsOf(jid: string): string {
  return bareUser(jid).replace(/\D/g, '')
}

/** Port of the old sock.decodeJid helper: strip the :device suffix */
export function decodeJid(jid: string | null | undefined): string | undefined {
  if (!jid) return undefined
  if (/:\d+@/gi.test(jid)) {
    const decoded = jidDecode(jid)
    return decoded?.user && decoded?.server
      ? `${decoded.user}@${decoded.server}`
      : jid
  }
  return jid
}

interface LooseKey {
  participant?: string | null
  remoteJid?: string | null
  participantAlt?: string | null
  remoteJidAlt?: string | null
  participantPn?: string | null
  senderPn?: string | null
}

function looseKey(msg: WAMessage): LooseKey {
  return (msg.key ?? {}) as unknown as LooseKey
}

/** key.participant || key.remoteJid || '' */
export function rawSenderJid(msg: WAMessage): string {
  const key = looseKey(msg)
  return key.participant || key.remoteJid || ''
}

/**
 * Best-effort PN straight from the message key, no lookup needed.
 * Checks participantPn / senderPn (runtime fields), then the typed
 * participantAlt / remoteJidAlt alternates WhatsApp ships.
 */
export function senderPnFromKey(msg: WAMessage): string | undefined {
  const key = looseKey(msg)
  const candidates = [key.participantPn, key.senderPn, key.participantAlt, key.remoteJidAlt]
  for (const c of candidates) {
    if (isPnJid(c)) return normalizePn(c)
  }
  const raw = rawSenderJid(msg)
  if (isPnJid(raw)) return normalizePn(raw)
  return undefined
}

/** Resolve any JID to its PN form via Baileys' LID mapping store. */
export async function resolveToPn(sock: WASocket, jid: string): Promise<string | undefined> {
  if (isPnJid(jid)) return normalizePn(jid)
  if (!isLidJid(jid)) return undefined
  try {
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid)
    if (pn) return normalizePn(pn)
  } catch {
    // mapping unavailable — caller falls back to the raw JID
  }
  return undefined
}

/** PN for a group participant, from the record itself (no lookup). */
export function participantPn(p: GroupParticipant): string | undefined {
  if (isPnJid(p.phoneNumber)) return normalizePn(p.phoneNumber)
  if (isPnJid(p.id)) return normalizePn(p.id)
  return undefined
}

export interface MentionTarget {
  /** full JID to put in mentions[] */
  jid: string
  /** text to show after @ */
  tag: string
}

/**
 * Build mention targets for a participant list.
 * Prefers PN jids (render as proper tags everywhere); falls back to the
 * raw LID jid + LID digits text (renders in LID-addressed groups).
 */
export async function buildMentionTargets(
  sock: WASocket,
  participants: GroupParticipant[]
): Promise<MentionTarget[]> {
  return Promise.all(
    participants.map(async (p): Promise<MentionTarget> => {
      const pn = participantPn(p) ?? (await resolveToPn(sock, p.lid ?? p.id))
      const lid = p.lid ?? ''
      const jid = pn ?? (isLidJid(lid) ? lid : p.id)
      return { jid, tag: bareUser(jid) }
    })
  )
}

/** Sync display string for a participant — never shows raw LID digits when a PN is on the record. */
export function displayUser(p: GroupParticipant): string {
  return digitsOf(participantPn(p) ?? p.id)
}

/** Canonical digit comparison for two JIDs regardless of address form. */
export function sameUser(a: string, b: string): boolean {
  return digitsOf(a) === digitsOf(b)
}
