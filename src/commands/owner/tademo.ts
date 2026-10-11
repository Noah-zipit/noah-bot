// !tademo — kept as a thin wrapper over the ShopAgent engine.
// T&A Electronics runs as the 'ta-electronics' business.
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { setShopChat, setShopVoice, listShopChats, bizForChat } from '../../lib/shopAgent.js'

const BIZ = 'ta-electronics'

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  const arg = (m.args[0] || '').toLowerCase()
  if (arg === 'on') {
    setShopChat(BIZ, m.chat, true)
    await m.reply('*T&A demo ON* for this chat.\n\nHar message ka jawab ab shop bot dega: text + voice note + catalogue.\nBand karne ke liye: *!tademo off*')
    return
  }
  if (arg === 'off') {
    setShopChat(BIZ, m.chat, false)
    await m.reply('*T&A demo OFF* for this chat.')
    return
  }
  if (arg === 'voice' && m.args[1]) {
    setShopVoice(BIZ, m.args[1])
    await m.reply('*T&A demo voice* set.')
    return
  }
  const chats = listShopChats(BIZ)[BIZ] || []
  const on = bizForChat(m.chat) === BIZ
  await m.reply(`*T&A demo*\n\nUsage: *!tademo on* / *!tademo off* / *!tademo voice <id>*\n\nActive chats: ${chats.length ? chats.join(', ') : 'none'}\n\nIs chat me: ${on ? 'ON' : 'OFF'}`)
}

export default {
  pattern: /^(tademo)$/i,
  handler,
  help: 'Toggle T&A Electronics demo mode for this chat',
  tags: ['owner'],
  owner: true,
}
