import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  await db.setSetting('mode', 'public')
  m.reply('*🌍 Bot is now PUBLIC*\n\nEveryone can use the bot.')
}

export default {
  pattern: /^(public)$/i,
  handler,
  help: 'Set bot to public mode (everyone can use it)',
  usage: '!public',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
