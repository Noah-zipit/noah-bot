import { performance } from 'node:perf_hooks'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  // Measure response time
  const start = performance.now()

  // Send initial message
  await m.reply('*Testing Noah Bot\'s reflexes...*')

  // Measure end time
  const end = performance.now()

  // Calculate response time
  const responseTime = Math.round(end - start)

  // Send final message
  await m.reply(`*Speed:* ${responseTime}ms\n\nNoah Bot's reflexes are as swift as Noah Bot's Plum Blossom Sword Command!`)

}

export default {
  pattern: /^(ping|speed|reflexes)$/i,
  handler,
  help: 'Test the bot\'s response time',
  tags: ['basic'],
  group: false,
  admin: false,
  owner: false
}
