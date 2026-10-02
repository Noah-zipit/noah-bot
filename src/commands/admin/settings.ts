import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Check if in group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Get group data
  const group = await db.getGroup(m.chat)

  // If no arguments, show current settings
  if (args.length === 0) {
    const settingsText = `
*༺ GROUP SETTINGS ༻*

*Welcome Messages:* ${group.settings.welcome ? '✅' : '❌'}
*Farewell Messages:* ${group.settings.goodbye ? '✅' : '❌'}
*Anti-Link Protection:* ${group.settings.antiLink ? '✅' : '❌'}
*Anti-Spam Protection:* ${group.settings.antiSpam ? '✅' : '❌'}
*Adult Content:* ${group.settings.nsfw ? '✅' : '❌'}
*Auto-Sticker:* ${group.settings.autoSticker ? '✅' : '❌'}

*Welcome Message:*
"${group.welcomeMessage}"

*Farewell Message:*
"${group.goodbyeMessage}"

To change a setting, use:
/settings [setting] [on/off]

Example: /settings welcome on

_""_
`

    return m.reply(settingsText)
  }

  // Check if user is admin for changing settings
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  // Get setting to change
  const setting = args[0].toLowerCase()
  const value = args[1]?.toLowerCase()

  // Valid settings
  const validSettings = ['welcome', 'goodbye', 'antilink', 'antispam', 'nsfw', 'autosticker']

  if (!validSettings.includes(setting)) {
    return m.reply(`Invalid setting. Available settings: ${validSettings.join(', ')}`)
  }

  if (!value || !['on', 'off'].includes(value)) {
    return m.reply('Please specify "on" or "off" for the setting.')
  }

  try {
    // Update setting
    const newValue = value === 'on'
    const settingKey = setting === 'antilink' ? 'antiLink' :
                      setting === 'antispam' ? 'antiSpam' :
                      setting === 'autosticker' ? 'autoSticker' : setting

    await db.updateGroup(m.chat, { [`settings.${settingKey}`]: newValue })

    m.reply(`*Setting Updated*\n\n*${setting}* has been turned *${value}*.\n\n_"A wise group admin adjusts rules to fit the users' needs."_`)

  } catch (error) {
    console.error('Error in settings command:', error)
    m.reply('Noah Bot encountered a error. The settings command failed.')
  }
}

export default {
  pattern: /^(settings|setting|config)$/i,
  handler,
  help: 'View or change group settings',
  usage: '!settings [setting] [on/off]',
  example: '!settings welcome on',
  tags: ['admin'],
  group: true,
  admin: false,
  owner: false
}
