// src/core/aiBridge.ts — delivers assistant answers for !ai queries.
// The !ai command (owner only) appends queries to ai-inbox.jsonl.
// A scheduled assistant run processes them and appends answers to ai-outbox.jsonl.
// This poller delivers pending answers to the right chat on this instance.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WASocket } from '@whiskeysockets/baileys'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTBOX = path.join(__dirname, '../../ai-outbox.jsonl')

interface OutboxEntry {
  id: string
  port: string
  chat: string
  answer: string
  status: string
  sent?: boolean
}

export function startAiBridge(getSock: () => WASocket | undefined | null): void {
  const myPort = String(process.env.WEB_PORT || process.env.PORT || '3000')

  setInterval(async () => {
    try {
      if (!fs.existsSync(OUTBOX)) return
      const raw = fs.readFileSync(OUTBOX, 'utf8')
      const lines = raw.split('\n')
      let changed = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.trim()) continue
        let e: OutboxEntry
        try {
          e = JSON.parse(line)
        } catch {
          continue
        }
        if (e.port !== myPort || e.status !== 'done' || e.sent || !e.chat || !e.answer) continue
        const sock = getSock()
        if (!sock) continue
        try {
          const text = e.answer.length > 60000 ? e.answer.slice(0, 60000) + '\n\n_(truncated)_' : e.answer
          await sock.sendMessage(e.chat, { text: `🤖 ${text}` })
          e.sent = true
          lines[i] = JSON.stringify(e)
          changed = true
        } catch (err) {
          console.error('ai bridge deliver error:', err)
        }
      }

      if (changed) fs.writeFileSync(OUTBOX, lines.join('\n'))
    } catch (err) {
      console.error('ai bridge poll error:', err)
    }
  }, 15000)
}
