import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  await db.setSetting('mode', 'private')
  m.reply('*🔒 Bot is now PRIVATE*\n\nOnly the owner can use the bot.')
}

export default {
  pattern: /^(private)$/i,
  handler,
  help: 'Set bot to private mode (owner only)',
  usage: '!private',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
