// Info command
import { formatTime } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  try {
    const uptime = formatTime(process.uptime())
    const prefix = global.prefix || '!'
    const totalCommands = Object.keys(global.plugins || {}).length
    const stats = await db.getSetting('stats') || { commands: 0, messages: 0 }

    const infoText = `
*${global.botname}*

*Prefix:* ${prefix}
*Uptime:* ${uptime}
*Commands:* ${totalCommands}
*Commands used:* ${stats.commands || 0}
*Messages seen:* ${stats.messages || 0}

Type *${prefix}menu* to see all commands.
`

    m.reply(infoText)
  } catch (error) {
    console.error('Error in info command:', error)
    m.reply('Something went wrong while fetching bot info.')
  }
}

export default {
  pattern: /^(info|about|bot)$/i,
  handler,
  help: 'Show bot information',
  tags: ['basic'],
  group: false,
  admin: false,
  owner: false
}
