import { formatTime } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type { GroupParticipant } from '@whiskeysockets/baileys'
import { displayUser } from '../../lib/jidUtils.js'

const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  // Get target user (mentioned or self)
  let targetJid = m.sender
  if (m.mentionedJid.length > 0) {
    targetJid = m.mentionedJid[0]
  }

  try {
    // Get user data
    const user = await db.getUser(targetJid)
    const { name, stats } = user

    // Format time stats
    const memberSince = formatTime((Date.now() - stats.joinDate) / 1000)
    const lastActive = formatTime((Date.now() - stats.lastSeen) / 1000)

    // Format premium status if applicable
    const premiumStatus = user.isPremium
      ? `*Premium:* Yes`
      : `*Premium:* No`

    // Create profile text
    const profileText = `
*USER PROFILE*

*Name:* ${name}
*Number:* ${displayUser({ id: targetJid } as GroupParticipant)}

*Stats:*
- Commands used: ${stats.commands}
- Messages sent: ${stats.messages}
- Member for: ${memberSince}
- Last active: ${lastActive} ago

${premiumStatus}
`

    // Update last seen time
    await db.updateUser(m.sender, { 'stats.lastSeen': Date.now() })

    // Fetch their full-size WhatsApp profile picture to send zoomed with
    // the details. Falls back to text-only when they have no picture or it
    // is not visible to the bot.
    let pfp: Buffer | null = null
    try {
      const url = await sock.profilePictureUrl(targetJid, 'image')
      if (url) {
        const res = await fetch(url)
        if (res.ok) pfp = Buffer.from(await res.arrayBuffer())
      }
    } catch {
      // no picture available — text-only fallback below
    }

    // Send profile
    if (pfp) {
      await sock.sendMessage(m.chat, { image: pfp, caption: profileText }, { quoted: m.message })
    } else {
      m.reply(profileText)
    }

  } catch (error) {
    console.error('Error in profile command:', error)
    m.reply('Something went wrong while fetching the profile.')
  }
}

export default {
  pattern: /^(profile|stats|me)$/i,
  handler,
  help: 'View your profile or another user\'s profile',
  tags: ['basic'],
  group: false,
  admin: false,
  owner: false
}
