import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { runBroadcast, bizForChat, listShopChats } from '../../lib/shopAgent.js'
import { getBusinessConfig } from '../../lib/supabaseSync.js'
import { loadBusiness } from '../../lib/shopBrain.js'

const handler = async (m: ParsedMessage, ctx: CommandContext) => {
  const bizId = (m.args[0] || '').toLowerCase()
  const text = m.args.slice(1).join(' ').trim()
  if (!bizId || !text) {
    await m.reply(`*Broadcast*\n\nUsage: *!broadcast <biz-id> <message>*\n\nSends to recent customer chats of that business (max 30, one per 2s).\n\nExample: *!broadcast ta-electronics Eid offer — 10% off this week*`)
    return
  }
  const cfg = getBusinessConfig(bizId) || loadBusiness(bizId)
  if (!cfg) {
    await m.reply(`Unknown business \`${bizId}\`.`)
    return
  }
  await m.reply(`Broadcast shuru kar raha hun — *${cfg.name}* ke recent customers ko...`)
  const sent = await runBroadcast(ctx.sock, bizId, text)
  await m.reply(`Broadcast complete: ${sent} customer(s).`)
}

export default {
  pattern: /^(broadcast)$/i,
  handler,
  help: 'Broadcast a message to recent customer chats: !broadcast <biz-id> <text>',
  tags: ['owner'],
  owner: true,
}
