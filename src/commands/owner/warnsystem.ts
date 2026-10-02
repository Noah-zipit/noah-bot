import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Get warn system mode
  const mode = args[0]?.toLowerCase()

  if (!mode || !['on', 'off', 'status'].includes(mode)) {
    const warnSystemEnabled = await db.getSetting('warnSystemEnabled')

    const warnText = `
*༺ WARN SYSTEM SETTINGS ༻*

*Status:* ${warnSystemEnabled ? 'Enabled ✅' : 'Disabled ❌'}

*Description:*
When enabled, users who accumulate 3 warnings will be automatically removed from groups.

*Available Commands:*
!warnsystem on - Enable the warn system
!warnsystem off - Disable the warn system
!warnsystem status - Show current status

_"Even the strictest rules must be tempered with wisdom."_
`

    return m.reply(warnText)
  }

  try {
    if (mode === 'on') {
      await db.setSetting('warnSystemEnabled', true)
      return m.reply('*Warn System Enabled*\n\nUsers with 3 warnings will now be automatically removed from groups.')
    }

    if (mode === 'off') {
      await db.setSetting('warnSystemEnabled', false)
      return m.reply('*Warn System Disabled*\n\nUsers will no longer be automatically removed for accumulating warnings.')
    }

    if (mode === 'status') {
      const warnSystemEnabled = await db.getSetting('warnSystemEnabled')
      return m.reply(`*Warn System Status:* ${warnSystemEnabled ? 'Enabled ✅' : 'Disabled ❌'}`)
    }

  } catch (error) {
    console.error('Error in warnsystem command:', error)
    m.reply('Noah Bot encountered a error. The warn system command failed.')
  }
}

export default {
  pattern: /^(warnsystem|warnsys)$/i,
  handler,
  help: 'Configure the automatic warn system',
  usage: '!warnsystem [on/off/status]',
  example: '!warnsystem on',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
