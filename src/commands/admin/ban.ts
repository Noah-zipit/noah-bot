import { isAdmin, isBotAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

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

  // Get user to ban
  let user: string
  if (m.mentionedJid.length > 0) {
    user = m.mentionedJid[0]
  } else if (args.length > 0) {
    // Try to find by number
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      user = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to be banned from this group!')
    }
  } else {
    return m.reply('Mention the user to be banned from this group!')
  }

  try {
    // Get user data
    const userData = await db.getUser(user)
    const userName = userData.name

    // Get group data
    const group = await db.getGroup(m.chat)

    // Check if unban command
    if (args.includes('unban') || args.includes('pardon')) {
      // Remove from blacklist
      const index = group.blacklisted.indexOf(user)
      if (index !== -1) {
        group.blacklisted.splice(index, 1)
        await db.updateGroup(m.chat, { blacklisted: group.blacklisted })

        return m.reply(`*Ban Lifted*\n\nThe user *${userName}* has been pardoned and may now participate in this group again.`)
      } else {
        return m.reply(`The user *${userName}* is not banned from this group.`)
      }
    }

    // Check if already banned
    if (group.blacklisted.includes(user)) {
      return m.reply(`The user *${userName}* is already banned from this group.`)
    }

    // Ban user (add to blacklist)
    group.blacklisted.push(user)
    await db.updateGroup(m.chat, { blacklisted: group.blacklisted })

    // Get ban reason if provided
    const reason = args.slice(1).join(' ') || 'Breaking group rules'

    // Kick user if bot is admin
    const botIsAdmin = await isBotAdmin(m.chat, sock)
    if (botIsAdmin) {
      await sock.groupParticipantsUpdate(m.chat, [user], 'remove')
    }

    // Send message
    await m.reply(`*Ban Enacted*\n\nThe user *${userName}* has been banned from this group.\n\n*Reason:* ${reason}\n\n_"Even the most talented user must respect the group's rules."_`)

  } catch (error) {
    console.error('Error in ban command:', error)
    m.reply('Noah Bot encountered a error. The ban command failed.')
  }
}

export default {
  pattern: /^(ban|blacklist)$/i,
  handler,
  help: 'Ban a user from the group',
  usage: '!ban @user [reason]',
  example: '!ban @John Disrespectful behavior',
  tags: ['admin'],
  group: true,
  admin: true,
  owner: false
}
