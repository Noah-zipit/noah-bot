import { formatTime, formatSize } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import os from 'node:os'

async function eventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const t = Date.now()
    setImmediate(() => resolve(Date.now() - t))
  })
}

async function instanceUp(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(4000) })
    const j = (await r.json()) as { registered?: boolean }
    return j.registered === true
  } catch {
    return false
  }
}

const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  try {
    m.react('🖥️')

    const lag = await eventLoopLag()
    const mem = process.memoryUsage()
    const uptime = formatTime(process.uptime())
    const sysMemUsed = os.totalmem() - os.freemem()
    const sysMemPct = Math.round((sysMemUsed / os.totalmem()) * 100)

    const users = (await db.getSetting('users')) || {}
    const groups = (await db.getSetting('groups')) || {}
    const stats = (await db.getSetting('stats')) || { commands: 0, messages: 0 }
    const totalCommands = Object.keys(global.plugins || {}).length

    const wa = sock.user ? 'LINKED' : 'DOWN'
    const inst1 = await instanceUp(3000)
    const inst2 = await instanceUp(3001)
    const cluster = `${inst1 && inst2 ? '2/2' : inst1 || inst2 ? '1/2' : '0/2'} ONLINE`

    const row = (k: string, v: string) => `│ ${k.padEnd(14)} ${v}`

    const out = [
      '```',
      '┌─ NOAH-BOT // SYS.DIAG ──────────',
      row('CORE', 'NOAH-BOT v2.0.0'),
      row('OPERATOR', 'ASHAR (owner)'),
      row('WHATSAPP', wa),
      row('CLUSTER', cluster),
      '├─ RUNTIME ───────────────────────',
      row('UPTIME', uptime),
      row('EVENT LOOP', `${lag}ms lag`),
      row('HEAP', `${formatSize(mem.heapUsed)} / ${formatSize(mem.heapTotal)}`),
      row('SYS MEM', `${formatSize(sysMemUsed)} / ${formatSize(os.totalmem())} (${sysMemPct}%)`),
      row('NODE', process.version),
      row('PLATFORM', `${os.platform()}-${os.arch()} (${os.cpus().length}c)`),
      '├─ TRAFFIC ───────────────────────',
      row('COMMANDS', `${totalCommands} loaded`),
      row('EXECUTED', `${stats.commands || 0}`),
      row('MESSAGES', `${stats.messages || 0} seen`),
      row('USERS', `${Object.keys(users).length}`),
      row('GROUPS', `${Object.keys(groups).length}`),
      '└─ STATUS: ALL SYSTEMS NOMINAL ───',
      '```',
      '_diagnostics pulled live from the host_'
    ].join('\n')

    m.reply(out)
  } catch (error) {
    console.error('Error in botstat command:', error)
    m.reply('❌ Diagnostics failed to run.')
  }
}

export default {
  pattern: /^(botstat|stat|stats|status|info|devstat|sysstat)$/i,
  handler,
  help: 'Live system diagnostics readout (owner only)',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
