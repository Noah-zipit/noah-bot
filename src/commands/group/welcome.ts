import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Check if in group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Get group data
  const group = await db.getGroup(m.chat)

  // If no arguments, show current welcome settings
  if (args.length === 0) {
    const welcomeStatus = group.settings.welcome ? 'Enabled ✅' : 'Disabled ❌'

    const welcomeText = `
*༺ WELCOME MESSAGE SETTINGS ༻*

*Status:* ${welcomeStatus}

*Current Welcome Message:*
"${group.welcomeMessage}"

*Available Commands:*
/welcome on - Enable welcome messages
/welcome off - Disable welcome messages
/welcome set [message] - Set custom welcome message

*Message Variables:*
{user} - Replaced with the joining member's name

_"A proper greeting sets the tone for a user's journey."_
`

    return m.reply(welcomeText)
  }

  // Check if user is admin for changing settings
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Handle different arguments
    if (args[0].toLowerCase() === 'on') {
      // Enable welcome messages
      await db.updateGroup(m.chat, { 'settings.welcome': true })
      return m.reply('*Welcome Messages Enabled*\n\nNew users will now be greeted upon joining this group.')
    }

    if (args[0].toLowerCase() === 'off') {
      // Disable welcome messages
      await db.updateGroup(m.chat, { 'settings.welcome': false })
      return m.reply('*Welcome Messages Disabled*\n\nNew users will no longer be greeted upon joining.')
    }

    if (args[0].toLowerCase() === 'set') {
      // Set custom welcome message
      if (args.length < 2) {
        return m.reply('Please provide a welcome message to set!\n\nExample: /welcome set Welcome to Noah Bot, {user}!')
      }

      const newWelcomeMessage = args.slice(1).join(' ')
      await db.updateGroup(m.chat, { welcomeMessage: newWelcomeMessage })

      return m.reply(`*Welcome Message Updated*\n\nNew welcome message:\n"${newWelcomeMessage}"`)
    }

    // Invalid argument
    return m.reply('Invalid option. Use "!welcome on", "!welcome off", or "!welcome set [message]"')

  } catch (error) {
    console.error('Error in welcome command:', error)
    m.reply('Noah Bot encountered a error. The welcome setting command failed.')
  }
}

export default {
  pattern: /^(welcome|greeting)$/i,
  handler,
  help: 'Configure welcome messages for new members',
  usage: '!welcome [on/off/set message]',
  example: '!welcome set Welcome to Noah Bot, {user}!',
  tags: ['group'],
  group: true,
  admin: false,
  owner: false
}
