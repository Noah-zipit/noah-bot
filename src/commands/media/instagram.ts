import { isValidURL } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  if (!args[0]) {
    return m.reply('Provide an Instagram link, user!')
  }

  if (!isValidURL(args[0]) || !args[0].includes('instagram.com')) {
    return m.reply('Please provide a valid Instagram link!')
  }

  try {
    // Inform user of progress
    m.reply(global.mess.wait)

    // Note: In a real implementation, you would use an Instagram downloader API
    // For demonstration purposes, we'll simulate the process

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Send mock response
    m.reply(`
*༺ INSTAGRAM DOWNLOAD ༻*

Noah Bot acknowledges your request to download from Instagram.

_In a real implementation, this command would download and send the Instagram photo or video._

_"Even in these modern platforms, wisdom can sometimes be found."_
`)


  } catch (error) {
    console.error('Error in instagram command:', error)
    m.reply('Noah Bot encountered a error while processing your Instagram link.')
  }
}

export default {
  pattern: /^(instagram|ig|insta)$/i,
  handler,
  help: 'Download Instagram photos and videos',
  usage: '!instagram [link]',
  example: '!instagram https://www.instagram.com/p/abcdefg/',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
