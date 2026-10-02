import { isBotAdmin, isAdmin, isOwner } from '../../core/messageHandler.js'
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

  // Get user to kick
  let user: string
  if (m.mentionedJid.length > 0) {
    user = m.mentionedJid[0]
  } else if (args.length > 0) {
    // Try to find by number
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      user = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to be expelled from the group!')
    }
  } else {
    return m.reply('Mention the user to be expelled from the group!')
  }

  try {
    // Check if user exists in group
    const groupMetadata = await sock.groupMetadata(m.chat)
    const participants = groupMetadata.participants

    if (!participants.some(p => digitsOf(participantPn(p) ?? p.id) === digitsOf(user))) {
      return m.reply('This user is not present in the group!')
    }

    // Check if the user is the bot itself
    if (digitsOf(user) === digitsOf(sock.user?.id ?? '')) {
      return m.reply('Noah Bot cannot expel himself. How absurd!')
    }

    // Check if the user is an admin
    const targetIsAdmin = participants.find(p => digitsOf(participantPn(p) ?? p.id) === digitsOf(user))?.admin
    if (targetIsAdmin && !isOwner(m.sender)) {
      return m.reply('Noah Bot cannot expel another group admin!')
    }

    // Get user data
    const userData = await db.getUser(user)
    const userName = userData.name

    // Kick user
    await sock.groupParticipantsUpdate(m.chat, [user], 'remove')

    // Send message
    await m.reply(`*User Removed*\n\nThe user *${userName}* has been expelled from the group.\n\n_"Those who cannot follow the group rules have no place among us."_`)

  } catch (error) {
    console.error('Error in kick command:', error)
    m.reply('Noah Bot encountered a error. The expulsion command failed.')
  }
}

export default {
  pattern: /^(kick|expel|remove)$/i,
  handler,
  help: 'Remove a user from the group',
  usage: '!kick @user',
  example: '!kick @John',
  tags: ['admin'],
  group: true,
  admin: true,
  owner: false
}
