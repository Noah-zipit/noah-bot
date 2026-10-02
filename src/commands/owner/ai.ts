// src/commands/owner/ai.ts — ask the assistant (Muse). Owner only.
// The query is queued to ai-inbox.jsonl; a scheduled assistant run answers it
// (or builds what was asked) and the answer is delivered back to this chat.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Repo root (dist/commands/owner -> ../../..), same dir as ai-outbox.jsonl
const INBOX = path.join(__dirname, '../../../ai-inbox.jsonl')

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const query = args.join(' ').trim()
  if (!query) {
    return m.reply('Ask me something: *!ai <your question>*\n\nI can answer questions or build things for you.')
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    port: String(process.env.WEB_PORT || process.env.PORT || '3000'),
    chat: m.chat,
    sender: m.sender,
    pushName: m.pushName || '',
    query,
    ts: Date.now(),
    status: 'pending'
  }

  try {
    fs.appendFileSync(INBOX, JSON.stringify(entry) + '\n')
  } catch (err) {
    console.error('ai inbox write error:', err)
    return m.reply('❌ Could not queue your question. Try again.')
  }

  m.reply('🤖 *Thinking...*\n\nI\'ll send the answer here when it\'s ready.')
}

export default {
  pattern: /^(ai|ask|gpt|Muse)$/i,
  handler,
  help: 'Ask the assistant anything (owner only)',
  usage: '!ai <your question>',
  example: '!ai build me a todo list app',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
