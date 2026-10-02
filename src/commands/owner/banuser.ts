import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { isOwner } from '../../core/messageHandler.js'

const handler = async (m: ParsedMessage, { args, db }: CommandContext) => {
  // Get user to ban
  let userToBan: string
  let userName = 'User'

  if (m.mentionedJid.length > 0) {
    userToBan = m.mentionedJid[0]
  } else if (args.length > 0) {
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      userToBan = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to be banned or provide their phone number!')
    }
  } else {
    return m.reply('Mention the user to be banned or provide their phone number!')
  }

  try {
    // Check if trying to ban an owner
    const userData = await db.getUser(userToBan)
    userName = userData.name

    if (isOwner(userToBan)) {
      return m.reply('You cannot ban another owner of Noah Bot!')
    }

    // Get reason if provided
    const reason = args.slice(1).join(' ') || 'No reason provided'

    // Ban the user
    await db.banUser(userToBan, reason)

    m.reply(`*༺ USER BANNED ༻*\n\nUser *${userName}* has been banned from Noah Bot.\n\n*Reason:* ${reason}`)

  } catch (error) {
    console.error('Error in banuser command:', error)
    m.reply('Noah Bot encountered a error while banning this user.')
  }
}

export default {
  pattern: /^(banuser|ban)$/i,
  handler,
  help: 'Ban a user from using the bot',
  usage: '!banuser @user [reason]',
  example: '!banuser @John Spamming',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
