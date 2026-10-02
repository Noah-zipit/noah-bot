import type { CommandPlugin } from './core/types.js'
import type Database from './core/database.js'

export interface MessageTemplates {
  wait: string
  success: string
  error: { stick: string; Iv: string; api: string }
  only: { group: string; owner: string; premium: string; admin: string; botAdmin: string }
}

declare global {
  var botname: string
  var ownername: string
  var prefix: string
  var packname: string
  var author: string
  /** [number, name, isOwner] entries from the OWNER env var */
  var owner: Array<[string, string, boolean]>
  var mess: MessageTemplates
  var plugins: Record<string, CommandPlugin>
  var db: Database
  var responses: Record<string, string[]> | undefined
}

export {}
