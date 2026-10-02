import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys'
import { HttpsProxyAgent } from 'https-proxy-agent'

// Route the WhatsApp WebSocket through the sandbox egress proxy when one is
// configured (the ws client does not honor proxy env vars on its own).
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.http_proxy
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
import type { WASocket } from '@whiskeysockets/baileys'
import type { Logger as PinoLogger, LoggerOptions } from 'pino'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// pino's type declarations expose no callable default export under NodeNext;
// resolve the CJS function directly and type it ourselves (runtime is fine).
const pino = require('pino') as (options?: LoggerOptions) => PinoLogger
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeJid } from '../lib/jidUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Create sessions directory (SESSION_DIR env isolates multiple instances)
const sessionDir = process.env.SESSION_DIR || path.join(__dirname, '../../sessions')
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true })
}

// Create tmp directory
const tmpDir = path.join(__dirname, '../../tmp')
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}

type LooseSocket = WASocket & {
  contacts?: Record<string, any>
  withoutContact?: boolean
}

/** Always points at the live socket (updated whenever a reconnect replaces it). */
export const sockHolder: { current: WASocket | null } = { current: null }

let replacedCallback: ((sock: WASocket) => void) | null = null

/** Register a callback fired with the new socket every time a reconnect replaces it. */
export function onSocketReplaced(cb: (sock: WASocket) => void): void {
  replacedCallback = cb
}

/**
 * Get a display name for a JID (contact, own user, or group).
 * Standalone function (Baileys v7 no longer keeps a contacts store on the
 * socket type, so the old sock.getName monkey-patch is replaced).
 */
export async function getContactName(sock: WASocket, jid: string | undefined | null, withoutContact = false): Promise<string> {
  if (!jid) return 'Unknown'

  const s = sock as LooseSocket
  const id = decodeJid(jid) ?? jid

  withoutContact = s.withoutContact || withoutContact

  if (id.endsWith('@g.us')) {
    let v: any = s.contacts?.[id] || {}
    if (!(v.name || v.subject)) v = (await sock.groupMetadata(id)) || {}
    return v.name || v.subject || 'Unknown Group'
  }

  let v: any
  if (id === '0@s.whatsapp.net') {
    v = { id, name: 'WhatsApp' }
  } else if (id === decodeJid(sock.user?.id)) {
    v = sock.user
  } else {
    v = s.contacts?.[id] || {}
  }

  return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || v.notify || v.vname || 'Unknown'
}

/**
 * Initialize WhatsApp connection
 */
export async function connectToWhatsApp(): Promise<WASocket> {
  // Restore a session handed over by the pairing service (SESSION_DATA is
  // base64(JSON { filename: base64-bytes })). Never clobbers an existing login.
  const credsPath = path.join(sessionDir, 'creds.json')
  const sessionData = process.env.SESSION_DATA?.trim()
  if (sessionData && !fs.existsSync(credsPath)) {
    try {
      const files = JSON.parse(Buffer.from(sessionData, 'base64').toString('utf8')) as Record<string, string>
      for (const [name, b64] of Object.entries(files)) {
        if (name.includes('/') || name.includes('\\') || name.startsWith('.')) continue
        fs.writeFileSync(path.join(sessionDir, name), Buffer.from(b64, 'base64'))
      }
      console.log('Session restored from SESSION_DATA — no QR/pairing needed')
    } catch (err) {
      console.error('Failed to restore SESSION_DATA:', err)
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)

  // Set up logger
  const logger = pino({
    level: 'silent',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  })

  // Create WhatsApp connection
  const sock = makeWASocket({
    logger,
    printQRInTerminal: true,
    auth: state,
    // Browsers.macOS('Chrome') -> ['Mac OS','Chrome','14.4.1']. A custom
    // browser[0] is not a known PlatformType, so WhatsApp 428s the connection.
    browser: Browsers.macOS('Chrome'),
    // Without this the socket is torn down 60s after the QR is issued
    // ("QR refs attempts ended"), killing a pairing-code flow mid-typing.
    qrTimeout: 300_000,
    // Sandbox egress proxy is very slow (~30s+ per WebSocket handshake);
    // the 20s default would time out every attempt.
    connectTimeoutMs: 120_000,
    ...(proxyAgent ? { agent: proxyAgent } : {})
  })
  sockHolder.current = sock

  // Set up connection event handling
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut

      console.log('Connection closed due to:', lastDisconnect?.error, 'Reconnecting:', shouldReconnect)

      if (shouldReconnect) {
        connectToWhatsApp()
          .then((newSock) => replacedCallback?.(newSock))
          .catch((err) => console.error('Reconnect failed:', err))
      }
    } else if (connection === 'open') {
      console.log('Connected to WhatsApp')
    }
  })

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds)

  return sock
}
