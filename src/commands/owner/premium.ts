import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type { GroupParticipant } from '@whiskeysockets/baileys'
import { displayUser } from '../../lib/jidUtils.js'

const handler = async (m: ParsedMessage, { args, db }: CommandContext) => {
  // Get user to make premium
  let userToPremium: string
  let userName = 'User'

  if (m.mentionedJid.length > 0) {
    userToPremium = m.mentionedJid[0]
  } else if (args.length > 0) {
    const potentialNumber = args[0].replace(/[^0-9]/g, '')
    if (potentialNumber.length > 8) {
      userToPremium = potentialNumber + '@s.whatsapp.net'
    } else {
      return m.reply('Mention the user to grant premium status or provide their phone number!')
    }
  } else {
    return m.reply('Mention the user to grant premium status or provide their phone number!')
  }

  try {
    const userData = await db.getUser(userToPremium)
    userName = userData.name

    // Check if user is already premium
    if (userData.isPremium) {
      return m.reply(`User *${userName}* already has premium status!`)
    }

    // Grant premium status
    await db.updateUser(userToPremium, { isPremium: true })

    m.reply(`*༺ PREMIUM STATUS GRANTED ༻*\n\nUser *${userName}* (${displayUser({ id: userToPremium } as GroupParticipant)}) now has premium status.\n\nPremium users gain access to exclusive features of Noah Bot.`)

  } catch (error) {
    console.error('Error in premium command:', error)
    m.reply('Noah Bot encountered a error while granting premium status.')
  }
}

export default {
  pattern: /^(premium|vip)$/i,
  handler,
  help: 'Grant premium status to a user',
  usage: '!premium @user',
  example: '!premium @John',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
