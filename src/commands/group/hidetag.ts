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

    // Get message
    const message = args.join(' ') || 'Noah Bot Secret Assembly!'

    // Get all member JIDs for hidden mention (PN form when resolvable,
    // so mentions render as proper tags instead of raw LID numbers)
    const targets = await buildMentionTargets(sock, participants)
    const mentions = targets.map(t => t.jid)

    // Send hidden tag message
    await sock.sendMessage(m.chat, {
      text: message,
      mentions
    })


  } catch (error) {
    console.error('Error in hidetag:', error)
    m.reply('Noah Bot encountered a error while executing the secret communication command.')
  }
}

export default {
  pattern: /^(hidetag|htag|hidden)$/i,
  handler,
  help: 'Tag all members without displaying the mentions',
  usage: '!hidetag [message]',
  example: '!hidetag Secret meeting now!',
  tags: ['group'],
  group: true,
  admin: true,
  owner: false
}
