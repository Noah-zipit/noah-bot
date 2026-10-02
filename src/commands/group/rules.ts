import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Check if in a group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Get group data
  const group = await db.getGroup(m.chat)

  // If no arguments, show rules
  if (args.length === 0) {
    const rulesText = `
*GROUP RULES*

${group.rules || 'No rules have been set for this group.'}

`
    return m.reply(rulesText)
  }

  // Check if user is admin for setting rules
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Set new rules
    const newRules = args.join(' ')
    await db.updateGroup(m.chat, { rules: newRules })

    m.reply(`*Rules Updated*\n\nThe rules for this gathering have been updated.\n\n`)

  } catch (error) {
    console.error('Error in rules command:', error)
    m.reply('Noah Bot encountered a error. The rules setting command failed.')
  }
}

export default {
  pattern: /^(rules|regulations)$/i,
  handler,
  help: 'View or set group rules',
  usage: '!rules [new rules text]',
  example: '!rules 1. Respect all members\\n2. No spamming\\n3. Follow admin instructions',
  tags: ['group'],
  group: true,
  admin: false,
  owner: false
}
