import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  // Check if specific command was requested
  if (args.length > 0) {
    const commandName = args[0].toLowerCase()

    // Find command in plugins
    let found = false
    for (const [id, plugin] of Object.entries(global.plugins)) {
      if (id.split('/')[1].replace(/\.(ts|js)$/, '').toLowerCase() === commandName ||
          (plugin.pattern && plugin.pattern.test(commandName))) {

        // Format permissions
        const permissions: string[] = []
        if (plugin.owner) permissions.push('Owner Only')
        if (plugin.admin) permissions.push('Administrators Only')
        if (plugin.group) permissions.push('Groups Only')
        if (plugin.premium) permissions.push('Core Users Only')

        // Create help text
        const helpText = `
*༺ Command: /${commandName} ༻*

*Description:* ${plugin.help || 'No description available'}
*Category:* ${plugin.category || 'Miscellaneous'}
${permissions.length > 0 ? `*Permissions:* ${permissions.join(', ')}` : ''}
${plugin.usage ? `*Usage:* ${plugin.usage}` : ''}
${plugin.example ? `*Example:* ${plugin.example}` : ''}

_"Understand a command before using it."_
`

        m.reply(helpText)
        found = true
        break
      }
    }

    if (!found) {
      m.reply(`Noah Bot knows no command called *${commandName}*. Check your spelling or use *!menu* to see available commands.`)
    }
  } else {
    // General help message
    const helpText = `
*༺ NOAH BOT HELP ༻*

To use a command, send a message starting with */*
Example: *!profile*

To get help with a specific command, use:
*!help [command name]*
Example: *!help profile*

*Command Categories:*
• *Basic* - Essential commands
• *Admin* - Group management commands
• *Group* - Group commands
• *Fun* - Entertainment commands
• *Media* - Media handling commands
• *Owner* - Owner commands

Use *!menu* to see all available commands.

_"A journey of a thousand miles begins with understanding the basics."_
`

    m.reply(helpText)
  }

}

export default {
  pattern: /^(help|guide|howto)$/i,
  handler,
  help: 'Get detailed help on commands',
  usage: '!help [command name]',
  example: '!help profile',
  tags: ['basic'],
  group: false,
  admin: false,
  owner: false
}
