import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  try {
    // React to message
    m.react('🔄')

    // Inform user of update
    await m.reply('*Noah Bot is checking for updates...*')

    // Execute git pull command
    try {
      const { stdout, stderr } = await execAsync('git pull')

      if (stderr) {
        console.error('Git pull stderr:', stderr)
      }

      // Check if there were updates
      if (stdout.includes('Already up to date')) {
        m.reply('*Noah Bot is already up to date. The latest techniques have been mastered.*')
      } else {
        m.reply(`*Noah Bot has been updated with the latest techniques!*\n\n\`\`\`\n${stdout}\n\`\`\`\n\n_Noah Bot must be restarted to apply these updates. Use the *!restart* command._`)
      }
    } catch (error) {
      console.error('Error executing git pull:', error)
      m.reply('*Noah Bot encountered a error while updating. The remote repository may be unreachable.*')
    }

  } catch (error) {
    console.error('Error in update command:', error)
    m.reply('Noah Bot encountered a error while attempting to update.')
  }
}

export default {
  pattern: /^(update|upgrade)$/i,
  handler,
  help: 'Update the bot from git repository',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
