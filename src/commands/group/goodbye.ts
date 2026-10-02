import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Check if in group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Get group data
  const group = await db.getGroup(m.chat)

  // If no arguments, show current goodbye settings
  if (args.length === 0) {
    const goodbyeStatus = group.settings.goodbye ? 'Enabled ✅' : 'Disabled ❌'

    const goodbyeText = `
*༺ FAREWELL MESSAGE SETTINGS ༻*

*Status:* ${goodbyeStatus}

*Current Farewell Message:*
"${group.goodbyeMessage}"

*Available Commands:*
/goodbye on - Enable farewell messages
/goodbye off - Disable farewell messages
/goodbye set [message] - Set custom farewell message

*Message Variables:*
{user} - Replaced with the leaving member's name

`

    return m.reply(goodbyeText)
  }

  // Check if user is admin for changing settings
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Handle different arguments
    if (args[0].toLowerCase() === 'on') {
      // Enable goodbye messages
      await db.updateGroup(m.chat, { 'settings.goodbye': true })
      return m.reply('*Farewell Messages Enabled*\n\nDeparting users will now receive a farewell message.')
    }

    if (args[0].toLowerCase() === 'off') {
      // Disable goodbye messages
      await db.updateGroup(m.chat, { 'settings.goodbye': false })
      return m.reply('*Farewell Messages Disabled*\n\nDeparting users will no longer receive a farewell message.')
    }

    if (args[0].toLowerCase() === 'set') {
      // Set custom goodbye message
      if (args.length < 2) {
        return m.reply('Please provide a farewell message to set!\n\nExample: /goodbye set Farewell, {user}. May your journey continue elsewhere.')
      }

      const newGoodbyeMessage = args.slice(1).join(' ')
      await db.updateGroup(m.chat, { goodbyeMessage: newGoodbyeMessage })

      return m.reply(`*Farewell Message Updated*\n\nNew farewell message:\n"${newGoodbyeMessage}"\n\n_"A proper farewell is as important as a proper greeting."_`)
    }

    // Invalid argument
    return m.reply('Invalid option. Use "!goodbye on", "!goodbye off", or "!goodbye set [message]"')

  } catch (error) {
    console.error('Error in goodbye command:', error)
    m.reply('Noah Bot encountered a error. The farewell setting command failed.')
  }
}

export default {
  pattern: /^(goodbye|farewell|leave)$/i,
  handler,
  help: 'Configure farewell messages for members who leave',
  usage: '!goodbye [on/off/set message]',
  example: '!goodbye set Farewell, {user}. May your journey continue elsewhere.',
  tags: ['group'],
  group: true,
  admin: false,
  owner: false
}
