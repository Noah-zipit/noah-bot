import { downloadMediaMessage } from '@whiskeysockets/baileys'
import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from './database.js'
import type { ParsedMessage, ParsedQuoted, MediaDownloadResult } from './types.js'
import {
  rawSenderJid,
  senderPnFromKey,
  resolveToPn,
  digitsOf,
  isLidJid,
  decodeJid,
  participantPn
} from '../lib/jidUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(__dirname, '../../tmp')

/** console-backed stand-in for Baileys' ILogger (messageHandler has no pino logger of its own) */
function consoleLogger(): any {
  const logger: Record<string, any> = {}
  const methods: Record<string, 'debug' | 'info' | 'warn' | 'error'> = {
    trace: 'debug',
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    fatal: 'error'
  }
  for (const [name, consoleMethod] of Object.entries(methods)) {
    logger[name] = (...args: unknown[]) => (console[consoleMethod] as (...a: unknown[]) => void)(...args)
  }
  logger.child = () => logger
  return logger
}

async function downloadToTmp(wamsg: WAMessage, type: string): Promise<MediaDownloadResult | null> {
  try {
    const buffer = await downloadMediaMessage(wamsg, 'buffer', {}, {
      logger: consoleLogger(),
      // No live re-upload channel here; surface a clear error instead of retrying blindly.
      reuploadRequest: async () => { throw new Error('media reupload not supported') }
    })

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    // Save to tmp folder
    const fileName = `${Date.now()}.${type.replace('Message', '')}`
    const filePath = path.join(tmpDir, fileName)

    fs.writeFileSync(filePath, buffer)

    return { buffer, fileName, filePath }
  } catch (e) {
    console.error('Error downloading media:', e)
    return null
  }
}

/**
 * Main message handler
 */
export async function handleMessage(message: WAMessage, sock: WASocket, db: Database): Promise<void> {
  // Check if this is a message
  if (!message.message) return

  // Parse the message
  const m = await parseMessage(message, sock)
  if (!m) return

  // Skip status broadcast messages
  if (m.key.remoteJid === 'status@broadcast') return

  // --- LID/PN identity canonicalization ---
  // Own messages keep the bot's own JID (as the JS version did); everything
  // else canonicalizes key.participant || key.remoteJid to the PN form when
  // WhatsApp's key alternates or the LID mapping store can resolve it.
  const rawSender = message.key.fromMe && sock.user?.id
    ? decodeJid(sock.user.id) ?? ''
    : rawSenderJid(message)
  const keyPn = senderPnFromKey(message)
  const mappedPn = keyPn ?? (await resolveToPn(sock, rawSender)) ?? db.lookupPnByLid(rawSender)

  let sender: string
  if (mappedPn) {
    // Remember the link so future messages resolve instantly and the user's
    // stored record (bans, warnings, premium) follows them across address forms.
    if (isLidJid(rawSender)) await db.linkLidPn(rawSender, mappedPn)
    sender = mappedPn
  } else {
    sender = rawSender
  }

  m.senderRaw = rawSender
  m.senderPn = mappedPn
  m.sender = sender
  // Messages sent from the bot's own linked device are the owner's own hands.
  m.isOwner = isOwner(m.sender) || !!message.key.fromMe

  // Track message (canonical sender — stats follow the person, not the address form)
  await db.trackMessage(m.sender, m.chat)

  // Log incoming message
  console.log(`[MSG] ${m.pushName} (${digitsOf(m.sender)}): ${m.body || m.type}`)

  // Check maintenance mode
  const maintenanceMode = await db.getSetting('maintenanceMode')
  if (maintenanceMode?.enabled && !m.isOwner) {
    m.reply(`*Bot is under maintenance*\n\nReason: ${maintenanceMode.reason}\n\n_Please try again later._`)
    return
  }

  // Check if user is banned
  const user = db.getUser(m.sender)
  if (user.banned && !m.isOwner) {
    m.reply(`*Access Denied*\n\nYou have been banned from using this bot.\n\nReason: ${user.banReason || 'No reason given'}`)
    return
  }

  // T&A Electronics demo mode: flagged DM chats get shop-bot replies
  // (text + Fish Audio voice note + catalogue) for every non-command message.
  if (!m.isGroup && !m.fromMe) {
    const { isTaDemoChat, handleTaDemoMessage } = await import('../lib/taDemo.js')
    if (isTaDemoChat(m.chat, m.sender) && !(m.body && m.body.startsWith(global.prefix || '!'))) {
      await handleTaDemoMessage(m, sock).catch(e => console.error('[tademo] handler error:', e))
      return
    }
  }

  // Process command if this is a command
  const prefix = global.prefix || '!'
  if (m.body && m.body.startsWith(prefix)) {
    const [command, ...args] = m.body.slice(prefix.length).trim().split(/\s+/)

    // Get all plugins
    const plugins = global.plugins || {}

    // Find matching plugin for this command
    for (const pluginId in plugins) {
      const { pattern, handler, owner, admin, group, premium } = plugins[pluginId]

      if (pattern && pattern.test(command)) {
        // Bot mode gate: in private mode only the owner may use commands
        const botMode = (await db.getSetting('mode')) || 'public'
        if (botMode === 'private' && !m.isOwner) {
          m.reply('*🔒 Bot is in private mode*\n\nOnly the owner can use the bot right now.')
          return
        }

        // Check permissions
        if (owner && !m.isOwner) {
          m.reply('Only the owner can use this command.')
          return
        }

        if (premium && !user.isPremium) {
          m.reply('This command is for premium users.')
          return
        }

        if (admin) {
          m.isAdmin = await isAdmin(m.sender, m.chat, sock)
          if (!m.isAdmin) {
            m.reply('Only group admins can use this command.')
            return
          }
        }

        if (group && !m.isGroup) {
          m.reply('This command can only be used in groups.')
          return
        }

        try {
          // Track command usage
          await db.trackCommand(command, m.sender)

          // Execute the command handler
          await handler(m, { sock, args, db })
        } catch (e) {
          console.error('Error executing command:', e)
          m.reply(`Error: ${(e as Error).message}`)
        }

        break
      }
    }
  }
}

/**
 * Parse incoming WhatsApp message
 */
async function parseMessage(message: WAMessage, sock: WASocket): Promise<ParsedMessage | null> {
  const inner = message.message ?? {}
  const types = Object.keys(inner)

  const type = types[0] ?? ''
  let body = ''
  if (type === 'conversation') {
    body = inner.conversation || ''
  } else if (type === 'extendedTextMessage') {
    body = inner.extendedTextMessage?.text || ''
  } else if (type === 'imageMessage') {
    body = inner.imageMessage?.caption || ''
  } else if (type === 'videoMessage') {
    body = inner.videoMessage?.caption || ''
  }

  const chat = decodeJid(message.key.remoteJid) ?? ''
  const fromMe = message.key.fromMe ?? undefined
  const isGroup = chat.endsWith('@g.us')

  // Mentions live on the inner message's contextInfo (not on the top-level key)
  const contextInfo =
    inner.extendedTextMessage?.contextInfo ??
    inner.imageMessage?.contextInfo ??
    inner.videoMessage?.contextInfo ??
    null
  const mentionedJid = (contextInfo?.mentionedJid ?? []).filter((j): j is string => !!j)

  // Get quoted message if any
  let quoted: ParsedQuoted | undefined
  const quotedMessage = inner.extendedTextMessage?.contextInfo?.quotedMessage
  if (type === 'extendedTextMessage' && quotedMessage) {
    const quotedType = Object.keys(quotedMessage)[0] ?? ''
    quoted = {
      message: quotedMessage,
      sender: decodeJid(inner.extendedTextMessage?.contextInfo?.participant) ?? '',
      type: quotedType
    }
    // Allow downloading quoted media (e.g. !sticker as a reply to an image)
    if (quotedType === 'imageMessage' || quotedType === 'videoMessage') {
      const quotedWamsg = { key: message.key, message: quotedMessage } as WAMessage
      quoted.download = () => downloadToTmp(quotedWamsg, quotedType)
    }
  }

  // Split out command parts when the body starts with the prefix
  const prefix = global.prefix || '!'
  let args: string[] = []
  let command: string | undefined
  if (body.startsWith(prefix)) {
    const parts = body.slice(prefix.length).trim().split(/\s+/)
    command = parts[0]
    args = parts.slice(1)
  }

  const m: ParsedMessage = {
    message,
    key: message.key,
    sender: rawSenderJid(message),
    senderRaw: rawSenderJid(message),
    senderPn: undefined,
    chat,
    fromMe,
    isGroup,
    pushName: message.pushName || 'Unknown',
    type,
    body,
    text: body,
    args,
    command,
    prefix,
    mentionedJid,
    quoted,
    isOwner: false,
    isAdmin: false,
    isBotAdmin: false,
    reply: (text: string) => sock.sendMessage(chat, { text }, { quoted: message }),
    react: (emoji: string) =>
      sock.sendMessage(chat, { react: { text: emoji, key: message.key } })
  }

  // Add download function for media messages
  if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(type)) {
    m.download = () => downloadToTmp(message, type)
  }

  return m
}

/**
 * Check if user is an owner (digit comparison — LID/PN agnostic)
 */
export function isOwner(jid: string): boolean {
  return global.owner.some(o => digitsOf(o[0]) === digitsOf(jid))
}

/**
 * Check if user is an admin (matches participants by canonical digits,
 * so LID-addressed groups work the same as PN-addressed ones)
 */
export async function isAdmin(jid: string, groupJid: string, sock: WASocket): Promise<boolean> {
  if (!groupJid.endsWith('@g.us')) return false

  try {
    const groupMetadata = await sock.groupMetadata(groupJid)
    const participant = groupMetadata.participants.find(
      p => digitsOf(participantPn(p) ?? p.id) === digitsOf(jid)
    )
    return !!participant && (participant.admin === 'admin' || participant.admin === 'superadmin')
  } catch (e) {
    console.error('Error checking admin status:', e)
    return false
  }
}

/**
 * Check if bot is admin
 */
export async function isBotAdmin(groupJid: string, sock: WASocket): Promise<boolean> {
  if (!groupJid.endsWith('@g.us')) return false

  try {
    const groupMetadata = await sock.groupMetadata(groupJid)
    const botDigits = digitsOf(sock.user?.id ?? '')
    const participant = groupMetadata.participants.find(
      p => digitsOf(participantPn(p) ?? p.id) === botDigits
    )
    return !!participant && (participant.admin === 'admin' || participant.admin === 'superadmin')
  } catch (e) {
    console.error('Error checking bot admin status:', e)
    return false
  }
}
