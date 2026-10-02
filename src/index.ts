// Import core modules
import { connectToWhatsApp, getContactName, sockHolder, onSocketReplaced } from './core/connection.js'
import type { WASocket } from '@whiskeysockets/baileys'
import { handleMessage } from './core/messageHandler.js'
import Database from './core/database.js'
import { loadPlugins } from './core/pluginLoader.js'
import { cleanTmp } from './core/utils.js'
import { participantPn } from './lib/jidUtils.js'
import { startPairingServer } from './web/pairingServer.js'
import { startAiBridge } from './core/aiBridge.js'
import './config.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logsDir = path.join(__dirname, '../logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`)

// Log rotation settings: keep daily files small so one noisy reconnect loop
// can't eat the disk again (2026-10-01.log hit 1.8GB).
const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5MB per file before rotating
const MAX_LOG_BACKUPS = 3            // keep .1, .2, .3
const LOG_RETENTION_DAYS = 7         // delete logs older than 7 days on startup

function rotateLogIfNeeded(): void {
  try {
    if (!fs.existsSync(logFile) || fs.statSync(logFile).size < MAX_LOG_SIZE) return
    for (let i = MAX_LOG_BACKUPS - 1; i >= 1; i--) {
      const older = `${logFile}.${i}`
      const newer = `${logFile}.${i + 1}`
      if (fs.existsSync(older)) fs.renameSync(older, newer)
    }
    fs.renameSync(logFile, `${logFile}.1`)
  } catch (e) {
    originalConsoleErrorSafe(e)
  }
}

function originalConsoleErrorSafe(e: unknown): void {
  try { process.stderr.write(`Log rotation failed: ${String(e)}\n`) } catch { /* ignore */ }
}

function pruneOldLogs(): void {
  try {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 3600 * 1000
    for (const f of fs.readdirSync(logsDir)) {
      if (!f.endsWith('.log') && !/\.log\.\d+$/.test(f)) continue
      const p = path.join(logsDir, f)
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// Suppress bursts of identical consecutive log lines (e.g. Baileys reconnect
// loops) — keep a count and write one summary line instead.
let lastLogKey = ''
let lastLogCount = 0
let lastLogAt = 0
const DEDUP_WINDOW_MS = 60 * 1000

function flushSuppressed(prefix: string): void {
  if (lastLogCount > 0) {
    const timestamp = new Date().toISOString()
    rotateLogIfNeeded()
    fs.appendFileSync(logFile, `[${timestamp}] ${prefix}(previous line repeated ${lastLogCount} more time(s) within 60s)\n`)
  }
  lastLogCount = 0
}

function writeLogLine(prefix: string, message: string): void {
  const now = Date.now()
  const key = prefix + message
  if (key === lastLogKey && now - lastLogAt < DEDUP_WINDOW_MS) {
    lastLogCount++
    lastLogAt = now
    return
  }
  flushSuppressed(prefix)
  lastLogKey = key
  lastLogAt = now
  const timestamp = new Date().toISOString()
  rotateLogIfNeeded()
  fs.appendFileSync(logFile, `[${timestamp}] ${prefix}${message}\n`)
}

// Initialize logging
const originalConsoleLog = console.log
const originalConsoleError = console.error

pruneOldLogs()

// Flush any pending duplicate-suppression summary before shutdown.
process.on('exit', () => {
  try { flushSuppressed('') } catch { /* ignore */ }
})

console.log = function (...args: unknown[]) {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ')

  writeLogLine('', message)
  originalConsoleLog(...args)
}

console.error = function (...args: unknown[]) {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ')

  writeLogLine('ERROR: ', message)
  originalConsoleError(...args)
}

// Set up globals
global.plugins = {}

// Initialize database
const db = new Database()
global.db = db

// Load plugins
async function init(): Promise<void> {
  // Check for restart marker
  if (fs.existsSync('./restart.marker')) {
    console.log('Bot was restarted intentionally')
    fs.unlinkSync('./restart.marker')
  }

  console.log('Loading plugins...')
  global.plugins = await loadPlugins()
  console.log(`Loaded ${Object.keys(global.plugins).length} plugins`)

  // Connect to WhatsApp
  console.log('Connecting to WhatsApp...')
  const sock = await connectToWhatsApp()

  // Attach message/group handlers (re-attached if a reconnect replaces the socket)
  const attachCoreHandlers = (s: WASocket): void => {
    // Set up message handler
    s.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const message of messages) {
          try {
            await handleMessage(message, s, db)
          } catch (err) {
            console.error('Error handling message:', err)
          }
        }
      }
    })

    // Set up group participant update handler
    s.ev.on('group-participants.update', async (update) => {
      // Implement group update handling
      console.log('Group participants update:', update)

      try {
        // Get group data
        const group = db.getGroup(update.id)

        // Handle welcome/goodbye messages based on config
        if (update.action === 'add' && group.settings.welcome) {
          for (const participant of update.participants) {
            // Get joined user name (prefer the PN form so LID-addressed members resolve)
            const userName = await getContactName(s, participantPn(participant) ?? participant.id)

            // Replace placeholders in welcome message
            const welcomeMsg = group.welcomeMessage.replace('{user}', userName)

            // Send welcome message
            await s.sendMessage(update.id, { text: welcomeMsg })
          }
        } else if (update.action === 'remove' && group.settings.goodbye) {
          for (const participant of update.participants) {
            // Get left user name (prefer the PN form so LID-addressed members resolve)
            const userName = await getContactName(s, participantPn(participant) ?? participant.id)

            // Replace placeholders in goodbye message
            const goodbyeMsg = group.goodbyeMessage.replace('{user}', userName)

            // Send goodbye message
            await s.sendMessage(update.id, { text: goodbyeMsg })
          }
        }
      } catch (err) {
        console.error('Error handling group update:', err)
      }
    })

    // Set up group settings update handler
    s.ev.on('groups.update', async (updates) => {
      console.log('Group updates:', updates)

      for (const update of updates) {
        try {
          // Update group name in database if changed
          if (update.subject && update.id) {
            db.updateGroup(update.id, { name: update.subject })
          }
        } catch (err) {
          console.error('Error handling group settings update:', err)
        }
      }
    })
  }

  attachCoreHandlers(sock)
  onSocketReplaced((newSock) => {
    console.log('Socket replaced after reconnect — re-attaching handlers')
    attachCoreHandlers(newSock)
  })

  // Pairing website: link WhatsApp with a phone number instead of QR
  // Railway injects PORT; WEB_PORT/WEB_HOST override for local or Docker use.
  // The link page is non-essential once paired, so a bind failure must never
  // crash the bot (the server itself also swallows EADDRINUSE).
  const webPort = Number(process.env.WEB_PORT || process.env.PORT || 3000)
  const webHost = process.env.WEB_HOST || '127.0.0.1'
  try {
    startPairingServer({ getSock: () => sockHolder.current, port: webPort, host: webHost })
  } catch (err) {
    console.error('Pairing server failed to start (continuing without link page):', err)
  }

  // AI bridge: deliver assistant answers for !ai queries back to WhatsApp
  startAiBridge(() => sockHolder.current)

  // Clean temporary files every hour
  setInterval(cleanTmp, 3600000)

  console.log('Noah Bot is now operational!')
  console.log(`Prefix: ${global.prefix}`)
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Start the bot
init().catch(console.error)
