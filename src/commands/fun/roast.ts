import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type { GroupParticipant } from '@whiskeysockets/baileys'
import { displayUser } from '../../lib/jidUtils.js'

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  // Get the target of the roast
  let targetName: string

  if (m.mentionedJid.length > 0) {
    // If someone was mentioned (displayed as digits, never raw LID form)
    const target = m.mentionedJid[0]
    targetName = displayUser({ id: target } as GroupParticipant)
  } else if (args.length > 0) {
    targetName = args.join(' ')
  } else {
    targetName = 'You'
  }

  try {
    const roasts = [
      `*${targetName}* is so slow, snails send them "hurry up" texts.`,
      `*${targetName}* has such a bright future behind them.`,
      `*${targetName}* is the reason the gene pool needs a lifeguard.`,
      `I'd agree with *${targetName}*, but then we'd both be wrong.`,
      `*${targetName}* is so forgetful, they once took a pregnancy test just to see if they were the father.`,
      `*${targetName}*'s brain is like the Bermuda Triangle — information goes in and is never found again.`,
      `*${targetName}* is living proof that evolution can go in reverse.`,
      `Some people bring happiness wherever they go. *${targetName}* brings happiness whenever they go.`,
      `*${targetName}* is so clumsy, they could trip over a wireless connection.`,
      `If *${targetName}* had a dollar for every smart thing they said, they'd be broke.`
    ]

    const roast = roasts[Math.floor(Math.random() * roasts.length)]

    // Send the roast
    await m.reply(`*ROAST*\n\n${roast}`)


  } catch (error) {
    console.error('Error in roast command:', error)
    m.reply('Something went wrong while preparing that roast.')
  }
}

export default {
  pattern: /^(roast|burn|insult)$/i,
  handler,
  help: 'Roast a user (all in good fun)',
  usage: '!roast @user',
  example: '!roast @John',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
