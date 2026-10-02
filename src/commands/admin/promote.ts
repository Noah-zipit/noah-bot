import { isAdmin, isBotAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { digitsOf, participantPn } from '../../lib/jidUtils.js'

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

  // Check if bot is admin
  const botIsAdmin = await isBotAdmin(m.chat, sock)
  if (!botIsAdmin) {
    return m.reply(global.mess.only.botAdmin)
  }

  // Get user to promote
  let user: string
  if (m.mentionedJid.length > 0) {
    user = m.mentionedJid[0]
  } else if (args.length > 0) {
    // Try to find by number
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      user = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to be promoted to group admin!')
    }
  } else {
    return m.reply('Mention the user to be promoted to group admin!')
  }

  try {
    // Get group metadata
    const groupMetadata = await sock.groupMetadata(m.chat)

    // Check if user is already admin (canonical digit match — LID/PN agnostic)
    const targetParticipant = groupMetadata.participants.find(
      p => digitsOf(participantPn(p) ?? p.id) === digitsOf(user)
    )
    if (targetParticipant && targetParticipant.admin) {
      return m.reply('This user is already a group admin!')
    }

    // Get user data
    const userData = await db.getUser(user)
    const userName = userData.name

    // Promote user
    await sock.groupParticipantsUpdate(m.chat, [user], 'promote')

    // Send success message
    await m.reply(`*Promotion Complete*\n\nThe user *${userName}* has been promoted to group admin.\n\n_"With great power comes great responsibility. Use it wisely."_`)

  } catch (error) {
    console.error('Error in promote command:', error)
    m.reply('Noah Bot encountered a error. The promotion command failed.')
  }
}

export default {
  pattern: /^(promote|admin|elevation)$/i,
  handler,
  help: 'Promote a user to group admin',
  usage: '!promote @user',
  example: '!promote @John',
  tags: ['admin'],
  group: true,
  admin: true,
  owner: false
}
