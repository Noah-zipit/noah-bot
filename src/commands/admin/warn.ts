import { isAdmin, isBotAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { digitsOf } from '../../lib/jidUtils.js'

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

  // Get user to warn
  let user: string
  if (m.mentionedJid.length > 0) {
    user = m.mentionedJid[0]
  } else if (args.length > 0) {
    // Try to find by number
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      user = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to be warned!')
    }
  } else {
    return m.reply('Mention the user to be warned!')
  }

  try {
    // Check if trying to warn bot
    if (digitsOf(user) === digitsOf(sock.user?.id ?? '')) {
      return m.reply('Noah Bot cannot warn himself. What foolishness!')
    }

    // Check if trying to warn an admin
    const isTargetAdmin = await isAdmin(user, m.chat, sock)
    if (isTargetAdmin) {
      return m.reply('Noah Bot cannot warn another group admin!')
    }

    // Get warning reason if provided
    const reason = args.slice(1).join(' ') || 'Breaking group rules'

    // Get user data
    const userData = await db.getUser(user)
    const userName = userData.name

    // Increment warnings
    userData.warnings = (userData.warnings || 0) + 1
    await db.updateUser(user, { warnings: userData.warnings })

    // Determine action based on warning count
    let actionText = ''
    if (userData.warnings >= 3) {
      // Reset warnings
      await db.updateUser(user, { warnings: 0 })

      // Kick if bot is admin
      const botIsAdmin = await isBotAdmin(m.chat, sock)
      if (botIsAdmin) {
        await sock.groupParticipantsUpdate(m.chat, [user], 'remove')
        actionText = 'They have been removed from the group for accumulating 3 warnings.'
      } else {
        actionText = 'They have accumulated 3 warnings and should be expelled, but Noah Bot lacks the authority.'
      }
    } else {
      actionText = `They now have ${userData.warnings}/3 warnings.`
    }

    // Send warning message
    await m.reply(`*Warning Issued*\n\nThe user *${userName}* has been warned.\n\n*Reason:* ${reason}\n\n${actionText}\n\n_"Three strikes, and one is expelled from Noah Bot."_`)

    // Notify the warned user
    try {
      await sock.sendMessage(user, {
        text: `*You Have Been Warned*\n\nYou have received a warning in the group "${(await sock.groupMetadata(m.chat)).subject}".\n\n*Reason:* ${reason}\n\n*Warning Count:* ${userData.warnings}/3\n\n_"Reflect on your actions, or face expulsion from Noah Bot."_`
      })
    } catch (err) {
      console.error('Error notifying warned user:', err)
    }

  } catch (error) {
    console.error('Error in warn command:', error)
    m.reply('Noah Bot encountered a error. The warning command failed.')
  }
}

export default {
  pattern: /^(warn|warning)$/i,
  handler,
  help: 'Warn a user for rule violations',
  usage: '!warn @user [reason]',
  example: '!warn @John Spamming in the group',
  tags: ['admin'],
  group: true,
  admin: true,
  owner: false
}
