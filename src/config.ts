import chalk from 'chalk'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Bot information
global.botname = process.env.BOT_NAME || 'Noah Bot'
global.ownername = process.env.OWNER_NAME || 'Noah'
global.prefix = process.env.PREFIX || '!'
global.packname = 'Noah Bot'
global.author = 'Noah Bot'

// Owner information
const ownerRaw = process.env.OWNER || '923164413714|Noah'
global.owner = ownerRaw.split(',').map(info => {
  const [number, name] = info.split('|')
  return [number, name || 'Noah', true] as [string, string, boolean]
})

// Message templates
global.mess = {
  wait: '*Please wait...*',
  success: 'Done!',
  error: {
    stick: 'Failed to create sticker.',
    Iv: 'Invalid link.',
    api: 'API error, please try again later.'
  },
  only: {
    group: 'This command can only be used in groups.',
    owner: 'Only the owner can use this command.',
    premium: 'This command is for premium users.',
    admin: 'Only group admins can use this command.',
    botAdmin: 'Make the bot an admin first.'
  }
}

// Log configuration
console.log(chalk.greenBright('Loading Noah Bot configuration...'))
console.log(chalk.yellowBright(`Bot Name: ${global.botname}`))
console.log(chalk.blueBright(`Owner: ${global.owner.map(o => o[1]).join(', ')}`))
console.log(chalk.blueBright(`Prefix: ${global.prefix}`))
