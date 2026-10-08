import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { isLidJid, normalizePn, digitsOf } from '../lib/jidUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data')

export interface UserStats {
  commands: number
  messages: number
  lastSeen: number
  joinDate: number
}

export interface UserSettings {
  language: string
  notifications: boolean
}

export interface RiddleState {
  question: string
  answer: string
  timestamp: number
}

export interface UserRecord {
  jid: string
  name: string
  stats: UserStats
  settings: UserSettings
  warnings: number
  banned: boolean
  banReason: string
  isPremium: boolean
  premiumExpires: number | null
  currentRiddle: RiddleState | null
}

export interface GroupSettings {
  welcome: boolean
  goodbye: boolean
  antiLink: boolean
  antiSpam: boolean
  nsfw: boolean
  autoSticker: boolean
}

export interface GroupRecord {
  jid: string
  name: string
  settings: GroupSettings
  welcomeMessage: string
  goodbyeMessage: string
  rules: string
  blacklisted: string[]
  muted: boolean
  muteExpires?: number
  stats: { messages: number }
}

export interface BotStats {
  commands: number
  messages: number
  startTime: number
}

export interface SettingsData {
  stats: BotStats
  [key: string]: unknown
}

export interface DatabaseData {
  users: Record<string, UserRecord>
  groups: Record<string, GroupRecord>
  settings: SettingsData
  lidmap: Record<string, string>
}

type StoreKey = 'users' | 'groups' | 'settings' | 'lidmap'

// Set a value on an object using a dotted key path, e.g. "stats.lastSeen"
function setDeep(obj: Record<string, any>, dottedKey: string, value: unknown): void {
  const keys = dottedKey.split('.')
  let cur: Record<string, any> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}

/** normalize a LID JID to digits-only form for stable map keys */
function normalizeLid(lid: string): string {
  return `${digitsOf(lid)}@lid`
}

export default class Database {
  dataDir: string
  data: DatabaseData

  constructor() {
    this.dataDir = dataDir
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

    this.data = {
      users: this.load<Record<string, UserRecord>>('users'),
      groups: this.load<Record<string, GroupRecord>>('groups'),
      settings: this.load<SettingsData>('settings'),
      lidmap: this.load<Record<string, string>>('lidmap')
    }

    // Ensure global stats object exists
    if (!this.data.settings.stats) {
      this.data.settings.stats = { commands: 0, messages: 0, startTime: Date.now() }
      this.save('settings')
    }

    console.log(chalk.green('Local database loaded (./data)'))
  }

  load<T extends object>(key: StoreKey): T {
    const p = path.join(this.dataDir, `${key}.json`)
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) as T
    } catch (e) {
      console.error(`Failed to load ${key}.json:`, (e as Error).message)
    }
    return {} as T
  }

  save(key: StoreKey): void {
    try {
      fs.writeFileSync(
        path.join(this.dataDir, `${key}.json`),
        JSON.stringify(this.data[key], null, 2)
      )
    } catch (e) {
      console.error(`Failed to save ${key}.json:`, (e as Error).message)
    }
  }

  // ---------- LID <-> PN identity map ----------

  /**
   * Record that a LID JID and a PN JID are the same person.
   * If a user record (with its bans/warnings/premium state) exists under
   * the LID key but not the PN key, it is migrated to the PN key.
   */
  async linkLidPn(lid: string, pn: string): Promise<void> {
    const lidKey = normalizeLid(lid)
    const pnKey = normalizePn(pn)
    if (!digitsOf(lidKey) || !digitsOf(pnKey)) return

    this.data.lidmap[lidKey] = pnKey

    const lidUser = this.data.users[lidKey]
    if (lidUser && !this.data.users[pnKey]) {
      lidUser.jid = pnKey
      this.data.users[pnKey] = lidUser
      delete this.data.users[lidKey]
      this.save('users')
    }

    this.save('lidmap')
  }

  /** PN JID previously linked to this LID JID, if any (sync). */
  lookupPnByLid(lid: string): string | undefined {
    if (!isLidJid(lid)) return undefined
    return this.data.lidmap[normalizeLid(lid)]
  }

  /** Canonical storage key for a JID: mapped PN when a LID link exists, else the JID itself. */
  canonicalId(jid: string): string {
    if (isLidJid(jid)) {
      const mapped = this.lookupPnByLid(jid)
      if (mapped) return mapped
    }
    return jid
  }

  // ---------- Users ----------

  defaultUser(jid: string, name = 'User'): UserRecord {
    return {
      jid,
      name,
      stats: {
        commands: 0,
        messages: 0,
        lastSeen: Date.now(),
        joinDate: Date.now()
      },
      settings: {
        language: 'en',
        notifications: true
      },
      warnings: 0,
      banned: false,
      banReason: '',
      isPremium: false,
      premiumExpires: null,
      currentRiddle: null
    }
  }

  getUser(jid: string): UserRecord {
    try {
      if (!this.data.users[jid]) {
        this.data.users[jid] = this.defaultUser(jid)
        this.save('users')
      }
      return this.data.users[jid]
    } catch (err) {
      console.error('Error getting user:', err)
      return this.defaultUser(jid)
    }
  }

  updateUser(jid: string, updates: Record<string, unknown>): boolean {
    try {
      const user = this.getUser(jid)
      for (const [key, value] of Object.entries(updates)) {
        setDeep(user as unknown as Record<string, any>, key, value)
      }
      this.save('users')
      return true
    } catch (err) {
      console.error('Error updating user:', err)
      return false
    }
  }

  async isUserBanned(jid: string): Promise<boolean> {
    try {
      const user = this.getUser(jid)
      return !!user.banned
    } catch (err) {
      console.error('Error checking if user is banned:', err)
      return false
    }
  }

  async banUser(jid: string, reason = ''): Promise<boolean> {
    return this.updateUser(jid, { banned: true, banReason: reason })
  }

  async unbanUser(jid: string): Promise<boolean> {
    return this.updateUser(jid, { banned: false, banReason: '' })
  }

  // ---------- Groups ----------

  defaultGroup(jid: string, name = 'Group'): GroupRecord {
    return {
      jid,
      name,
      settings: {
        welcome: true,
        goodbye: false,
        antiLink: false,
        antiSpam: false,
        nsfw: false,
        autoSticker: false
      },
      welcomeMessage: 'Welcome, {user}!',
      goodbyeMessage: 'Goodbye, {user}.',
      rules: 'No rules set.',
      blacklisted: [],
      muted: false,
      stats: { messages: 0 }
    }
  }

  getGroup(jid: string): GroupRecord {
    try {
      if (!this.data.groups[jid]) {
        this.data.groups[jid] = this.defaultGroup(jid)
        this.save('groups')
      }
      return this.data.groups[jid]
    } catch (err) {
      console.error('Error getting group:', err)
      return this.defaultGroup(jid)
    }
  }

  updateGroup(jid: string, updates: Record<string, unknown>): boolean {
    try {
      const group = this.getGroup(jid)
      for (const [key, value] of Object.entries(updates)) {
        setDeep(group as unknown as Record<string, any>, key, value)
      }
      this.save('groups')
      return true
    } catch (err) {
      console.error('Error updating group:', err)
      return false
    }
  }

  // ---------- Stats tracking ----------

  async trackCommand(command: string, userId: string): Promise<void> {
    try {
      const stats = this.data.settings.stats
      stats.commands += 1

      const cmdKey = `cmd_${command}`
      const existing = this.data.settings[cmdKey] as { count: number } | undefined
      if (!existing) this.data.settings[cmdKey] = { count: 0 }
      ;(this.data.settings[cmdKey] as { count: number }).count += 1
      this.save('settings')

      const user = this.getUser(userId)
      user.stats.commands += 1
      user.stats.lastSeen = Date.now()
      this.save('users')
    } catch (err) {
      console.error('Error tracking command:', err)
    }
  }

  async trackMessage(userId: string, groupId: string | null = null): Promise<void> {
    try {
      this.data.settings.stats.messages += 1
      this.save('settings')

      const user = this.getUser(userId)
      user.stats.messages += 1
      user.stats.lastSeen = Date.now()
      this.save('users')

      if (groupId && groupId.endsWith('@g.us')) {
        const group = this.getGroup(groupId)
        group.stats.messages += 1
        this.save('groups')
      }
    } catch (err) {
      console.error('Error tracking message:', err)
    }
  }

  // ---------- Settings ----------

  async getSetting(key: string): Promise<any> {
    try {
      return this.data.settings[key] ?? null
    } catch (err) {
      console.error('Error getting setting:', err)
      return null
    }
  }

  async setSetting(key: string, value: unknown): Promise<boolean> {
    try {
      this.data.settings[key] = value
      this.save('settings')
      return true
    } catch (err) {
      console.error('Error setting setting:', err)
      return false
    }
  }

  // Compatibility with older code
  async write(): Promise<boolean> {
    this.save('users')
    this.save('groups')
    this.save('settings')
    this.save('lidmap')
    return true
  }
}
