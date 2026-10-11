import type { ParsedMessage, CommandContext } from '../../core/types.js'
import {
  setShopChat,
  setShopChatOffEverywhere,
} from '../../lib/shopAgent.js'
import { getBusinessConfig, allBusinessIds } from '../../lib/supabaseSync.js'
import { loadBusiness } from '../../lib/shopBrain.js'

function bizName(id: string): string {
  return getBusinessConfig(id)?.name || loadBusiness(id)?.name || id
}

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  const sub = (m.args[0] || '').toLowerCase()

  if (sub === 'on' && m.args[1]) {
    const bizId = m.args[1].toLowerCase()
    if (!allBusinessIds().includes(bizId)) {
      await m.reply(`Unknown business \`${bizId}\`.`)
      return
    }
    setShopChat(bizId, m.chat, true)
    await m.reply(`*${bizName(bizId)}* demo ON in this chat.\n\nBand karne ke liye: *!demo off*`)
    return
  }

  if (sub === 'off') {
    const off = setShopChatOffEverywhere(m.chat)
    await m.reply(off.length ? `Demo OFF for this chat (${off.join(', ')}).` : 'Is chat me koi demo on nahi tha.')
    return
  }

  await m.reply(`*Demo*\n\n*!demo on <biz>* — start demo in this chat\n*!demo off* — stop demo\n\nBusinesses: ${allBusinessIds().map(b => `\`${b}\``).join(', ') || 'none'}`)
}

export default {
  pattern: /^(demo)$/i,
  handler,
  help: 'Show a ShopAgent demo in this chat (on/off)',
  tags: ['owner'],
  owner: true,
}
