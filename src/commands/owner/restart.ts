import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  try {
    // React to message
    m.react('♻️')

    // Inform user of restart
    await m.reply('*༺ NOAH BOT RESTART ༻*\n\nNoah Bot is restarting. This will take a few moments...')

    // Restart the process
    console.log('Restarting bot by owner request...')
    process.exit(1) // Exit with code 1, which should be handled by the restart script

  } catch (error) {
    console.error('Error in restart command:', error)
    m.reply('Noah Bot encountered a error while attempting to restart.')
  }
}

export default {
  pattern: /^(restart|reboot)$/i,
  handler,
  help: 'Restart the bot',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
