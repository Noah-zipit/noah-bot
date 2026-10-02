import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type { GroupParticipant } from '@whiskeysockets/baileys'
import { displayUser } from '../../lib/jidUtils.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  try {
    // Get target user
    let targetJid: string | null = null
    let targetName = 'user'

    if (m.mentionedJid.length > 0) {
      targetJid = m.mentionedJid[0]
      const user = await db.getUser(targetJid)
      targetName = user.name
    } else if (args.length > 0) {
      targetName = args.join(' ')
    }

    // Get user data
    const user = await db.getUser(m.sender)

    // Array of challenges
    const challenges = [
      `${targetName} must stay silent for 10 minutes.`,
      `${targetName} must send a voice note singing their favorite song.`,
      `${targetName} must send a funny selfie within 5 minutes.`,
      `${targetName} must write a 4-line poem about this group.`,
      `${targetName} must stand on one leg for 3 minutes, then send proof.`,
      `${targetName} must not send any messages for 30 minutes.`,
      `${targetName} must compliment three users in this group.`,
      `${targetName} must speak only in third person for the next hour.`,
      `${targetName} must share an embarrassing story about themselves.`,
      `${targetName} must draw something and share it.`,
      `${targetName} must do 10 pushups and send proof.`,
      `${targetName} must find and share an inspirational quote.`,
      `${targetName} must go outside and take a picture of the sky.`,
      `${targetName} must drink a full cup of water without stopping.`,
      `${targetName} must describe their dream vacation in vivid detail.`
    ]

    // Select a random challenge
    const challenge = challenges[Math.floor(Math.random() * challenges.length)]

    // Format challenge message
    const challengeText = `
*༺ CHALLENGE ༻*

Challenge issued!

*Challenged User:* ${targetName}
*Challenge:* ${challenge}

_"True growth comes from pushing beyond your comfort zone."_
`

    // Send challenge
    m.reply(challengeText)

    // Tag the target if it's a valid user
    if (targetJid) {
      sock.sendMessage(m.chat, {
        text: `@${displayUser({ id: targetJid } as GroupParticipant)}, do you accept this challenge?`,
        mentions: [targetJid]
      })
    }


  } catch (error) {
    console.error('Error in challenge command:', error)
    m.reply('Noah Bot encountered a error while crafting a challenge.')
  }
}

export default {
  pattern: /^(challenge|task|dare)$/i,
  handler,
  help: 'Issue a challenge to another user',
  usage: '!challenge @user',
  example: '!challenge @John',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
