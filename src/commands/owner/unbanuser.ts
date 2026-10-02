import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { args, db }: CommandContext) => {
  // Get user to unban
  let userToUnban: string
  let userName = 'User'

  if (m.mentionedJid.length > 0) {
    userToUnban = m.mentionedJid[0]
  } else if (args.length > 0) {
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      userToUnban = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to be unbanned or provide their phone number!')
    }
  } else {
    return m.reply('Mention the user to be unbanned or provide their phone number!')
  }

  try {
    const userData = await db.getUser(userToUnban)
    userName = userData.name

    // Check if user is banned
    if (!userData.banned) {
      return m.reply(`User *${userName}* is not banned!`)
    }

    // Unban the user
    await db.unbanUser(userToUnban)

    m.reply(`*༺ USER UNBANNED ༻*\n\nUser *${userName}* has been unbanned and can now use Noah Bot.`)

  } catch (error) {
    console.error('Error in unbanuser command:', error)
    m.reply('Noah Bot encountered a error while unbanning this user.')
  }
}

export default {
  pattern: /^(unbanuser|unban|pardon)$/i,
  handler,
  help: 'Unban a user from using the bot',
  usage: '!unbanuser @user',
  example: '!unbanuser @John',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
