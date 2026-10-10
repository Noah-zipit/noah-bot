import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { isTaDemoChat, setTaDemoChat, setTaDemoVoice, listTaDemoChats } from '../../lib/taDemo.js'

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  const arg = (m.args[0] || '').toLowerCase()
  if (arg === 'on') {
    setTaDemoChat(m.chat, true)
    await m.reply('*T&A demo ON* for this chat.\n\nHar message ka jawab ab shop bot dega: text + voice note + catalogue.\nBand karne ke liye: *!tademo off*')
    return
  }
  if (arg === 'off') {
    setTaDemoChat(m.chat, false)
    await m.reply('*T&A demo OFF* for this chat.')
    return
  }
  if (arg === 'voice' && m.args[1]) {
    setTaDemoVoice(m.args[1])
    await m.reply('*T&A demo voice* set.')
    return
  }
  const chats = listTaDemoChats()
  await m.reply(`*T&A demo*\n\nUsage: *!tademo on* / *!tademo off* / *!tademo voice <id>*\n\nActive chats: ${chats.length ? chats.join(', ') : 'none'}\n\nIs chat me: ${isTaDemoChat(m.chat) ? 'ON' : 'OFF'}`)
}

export default {
  pattern: /^(tademo)$/i,
  handler,
  help: 'Toggle T&A Electronics demo mode for this chat',
  tags: ['owner'],
  owner: true,
}
