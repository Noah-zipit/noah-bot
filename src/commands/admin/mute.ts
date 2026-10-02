import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { parseTimeString, formatTime } from '../../core/utils.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Check if in group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Check if user is admin
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Get group data
    const group = await db.getGroup(m.chat)

    // Check for unmute command
    if (args[0] === 'off' || args[0] === 'unmute') {
      if (!group.muted) {
        return m.reply('This group is not silenced.')
      }

      // Unmute the group
      await db.updateGroup(m.chat, { muted: false })

      return m.reply('*Silencing Command Released*\n\nUsers may now speak freely in this gathering.')
    }

    // If no arguments and already muted, show status
    if (args.length === 0 && group.muted) {
      return m.reply('This group is currently silenced. Only administrators may speak.')
    }

    // If no arguments and not muted, mute indefinitely
    if (args.length === 0) {
      await db.updateGroup(m.chat, { muted: true })

      return m.reply('*Silencing Command Applied*\n\nThis group has been silenced. Only administrators may speak now.')
    }

    // Parse time if provided (e.g., 30m, 1h, etc.)
    const timeStr = args[0]
    const durationMs = parseTimeString(timeStr)

    if (durationMs > 0) {
      // Set mute with expiry
      const expiryTime = Date.now() + durationMs

      await db.updateGroup(m.chat, {
        muted: true,
        muteExpires: expiryTime
      })

      // Format duration for message
      const duration = formatTime(durationMs / 1000)

      return m.reply(`*Temporary Silencing Command Applied*\n\nThis group has been silenced for *${duration}*. Only administrators may speak during this period.`)
    } else {
      // Indefinite mute
      await db.updateGroup(m.chat, { muted: true })

      return m.reply('*Silencing Command Applied*\n\nThis group has been silenced. Only administrators may speak now.')
    }

  } catch (error) {
    console.error('Error in mute command:', error)
    m.reply('Noah Bot encountered a error. The silencing command failed.')
  }
}

export default {
  pattern: /^(mute|silence|quiet)$/i,
  handler,
  help: 'Mute the group chat',
  usage: '!mute [duration]',
  example: '!mute 30m',
  tags: ['admin'],
  group: true,
  admin: true,
  owner: false
}
