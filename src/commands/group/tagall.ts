import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { buildMentionTargets } from '../../lib/jidUtils.js'

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  // Check if in a group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Check if user is admin
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Get group metadata
    const groupMetadata = await sock.groupMetadata(m.chat)
    const participants = groupMetadata.participants

    // Get custom message if provided
    const message = args.join(' ') || 'Noah Bot Assembly! All users report at once!'

    // Format mentions — resolve to PN form so every member renders as a
    // proper tag instead of a raw LID number like @23277710033892
    const targets = await buildMentionTargets(sock, participants)

    let text = `*TAG ALL*\n\n${message}\n\n`

    targets.forEach((target, i) => {
      text += `${i + 1}. @${target.tag}\n`
    })

    text += ''

    // Send message with mentions
    await sock.sendMessage(m.chat, {
      text,
      mentions: targets.map(t => t.jid)
    })


  } catch (error) {
    console.error('Error in tagall:', error)
    m.reply('Noah Bot encountered a error while gathering the users.')
  }
}

export default {
  pattern: /^(tagall|everyone|all|assembly)$/i,
  handler,
  help: 'Mention all group members',
  usage: '!tagall [message]',
  example: '!tagall Urgent meeting now!',
  tags: ['group'],
  group: true,
  admin: true,
  owner: false
}
