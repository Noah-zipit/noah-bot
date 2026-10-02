import type { WAMessage, WAMessageKey, WASocket } from '@whiskeysockets/baileys'
import type Database from './database.js'

export interface ParsedQuoted {
  message: WAMessage['message']
  sender: string
  type: string
  download?: () => Promise<MediaDownloadResult | null>
}

export interface MediaDownloadResult {
  buffer: Buffer
  fileName: string
  filePath: string
}

export interface ParsedMessage {
  message: WAMessage
  key: WAMessageKey
  chat: string
  /** canonical sender JID (PN form when resolvable, else the raw address) */
  sender: string
  /** raw key.participant || key.remoteJid, exactly as WhatsApp sent it */
  senderRaw: string
  /** resolved PN JID, if one could be determined */
  senderPn?: string
  fromMe?: boolean
  isGroup: boolean
  pushName: string
  type: string
  body: string
  text: string
  args: string[]
  command?: string
  prefix: string
  mentionedJid: string[]
  quoted?: ParsedQuoted
  isOwner: boolean
  isAdmin: boolean
  isBotAdmin: boolean
  reply: (text: string) => Promise<WAMessage | undefined>
  react: (emoji: string) => Promise<WAMessage | undefined>
  download?: () => Promise<MediaDownloadResult | null>
}

export interface CommandContext {
  sock: WASocket
  args: string[]
  db: Database
}

export interface CommandPlugin {
  name: string
  pattern: RegExp
  handler: (m: ParsedMessage, ctx: CommandContext) => Promise<unknown> | unknown
  description?: string
  help?: string
  usage?: string
  example?: string
  tags?: string[]
  category: string
  filename: string
  group?: boolean
  admin?: boolean
  owner?: boolean
  premium?: boolean
  hide?: boolean
}
