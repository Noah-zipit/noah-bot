import type { ParsedMessage, CommandContext } from '../../core/types.js'
import {
  setShopChat,
  setShopChatOffEverywhere,
  listShopChats,
  setShopVoice,
  bizForChat,
} from '../../lib/shopAgent.js'
import { getBusinessConfig, allBusinessIds, botEnabled } from '../../lib/supabaseSync.js'
import { loadBusiness } from '../../lib/shopBrain.js'

function bizName(id: string): string {
  return getBusinessConfig(id)?.name || loadBusiness(id)?.name || id
}

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  const sub = (m.args[0] || '').toLowerCase()

  if (sub === 'list') {
    const ids = allBusinessIds()
    const lines = ids.map(id => `• *${bizName(id)}* — \`${id}\` ${botEnabled(id) ? '' : '(paused)'}`)
    await m.reply(`*ShopAgent businesses*\n\n${lines.join('\n') || 'none'}`)
    return
  }

  if (sub === 'on' && m.args[1]) {
    const bizId = m.args[1].toLowerCase()
    if (!allBusinessIds().includes(bizId)) {
      await m.reply(`Unknown business \`${bizId}\`. Use *!shop list*.`)
      return
    }
    setShopChat(bizId, m.chat, true)
    await m.reply(`*${bizName(bizId)}* agent ON for this chat.\n\nHar message ka jawab ab shop bot dega. Band karne ke liye: *!shop off*`)
    return
  }

  if (sub === 'off') {
    const off = setShopChatOffEverywhere(m.chat)
    await m.reply(off.length ? `Shop agent OFF for this chat (${off.join(', ')}).` : 'Is chat me koi shop agent on nahi tha.')
    return
  }

  if (sub === 'voice' && m.args[1] && m.args[2]) {
    const bizId = m.args[1].toLowerCase()
    setShopVoice(bizId, m.args[2])
    await m.reply(`Voice set for *${bizName(bizId)}*.`)
    return
  }

  if (sub === 'status') {
    const current = bizForChat(m.chat, m.sender)
    const counts = listShopChats()
    const lines = Object.entries(counts).map(([id, chats]) => `• *${bizName(id)}*: ${chats.length} chat(s)`)
    await m.reply(`*ShopAgent status*\n\nIs chat me: ${current ? `*${bizName(current)}* ON` : 'OFF'}\n\n${lines.join('\n') || 'no active chats'}`)
    return
  }

  await m.reply(`*ShopAgent*\n\nUsage:\n*!shop list* — businesses\n*!shop on <biz>* — enable here\n*!shop off* — disable here\n*!shop status* — this chat + counts\n*!shop voice <biz> <id>* — set voice`)
}

export default {
  pattern: /^(shop)$/i,
  handler,
  help: 'Manage ShopAgent business bots (list/on/off/status/voice)',
  tags: ['owner'],
  owner: true,
}
