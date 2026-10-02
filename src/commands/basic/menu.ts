// src/commands/basic/menu.ts
import { formatTime } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logoPath = path.join(__dirname, '../../../assets/menu.jpg')
const legacyLogoPath = path.join(__dirname, '../../../asset/logo.jpg')
const menuImagePath = fs.existsSync(logoPath) ? logoPath : legacyLogoPath

// Category styling
const CATEGORY_COLORS: Record<string, string> = {
  basic: '*BASIC*',
  admin: '*ADMIN*',
  group: '*GROUP*',
  fun: '*FUN*',
  media: '*MEDIA*',
  owner: '*OWNER*'
}

// Fancy dividers for categories
const CATEGORY_DIVIDER = '*--- %s ---*'

const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  try {
    // Get uptime
    const uptime = formatTime(process.uptime())

    // Get user data
    const user = await db.getUser(m.sender)
    const prefix = global.prefix || '!'

    // Build command list
    const commandsByCategory: Record<string, string[]> = {}
    Object.entries(global.plugins).forEach(([id, plugin]) => {
      // Skip hidden commands
      if (plugin.hide) return

      const category = plugin.category || 'misc'
      if (!commandsByCategory[category]) commandsByCategory[category] = []

      const cmd = id.split('/')[1].replace(/\.(ts|js)$/, '')

      // Add permission indicators
      let cmdText = `${prefix}${cmd}`
      if (plugin.owner) cmdText += ' [owner]'
      if (plugin.premium) cmdText += ' [premium]'

      if (!commandsByCategory[category].includes(cmdText)) {
        commandsByCategory[category].push(cmdText)
      }
    })

    // Format menu text
    let text = `*${global.botname}*\n`
    text += `Prefix: ${prefix}\n`

    // Add commands by category
    Object.entries(commandsByCategory).sort().forEach(([category, cmds]) => {
      if (cmds.length > 0 && CATEGORY_COLORS[category]) {
        // Add category header with divider
        text += `\n${CATEGORY_DIVIDER.replace('%s', category.toUpperCase())}\n`

        // Add commands as comma-separated list
        text += cmds.join(' , ')
        text += '\n'
      }
    })

    // Add footer with user info and stats
    text += `\n--------------------\n`
    text += `User: *${user.name}*\n`
    text += `Uptime: ${uptime}\n`

    // Check if menu image exists
    if (fs.existsSync(menuImagePath)) {
      // Send menu with image
      await sock.sendMessage(m.chat, {
        image: fs.readFileSync(menuImagePath),
        caption: text
      }, { quoted: m.message })
    } else {
      // Send text-only menu if image doesn't exist
      await m.reply(text)
    }

  } catch (error) {
    console.error('Error in menu command:', error)
    m.reply('Could not load the menu. Try again later.')
  }
}

export default {
  pattern: /^(menu|commands|list)$/i,
  handler,
  help: 'Display all available commands',
  tags: ['basic'],
  group: false,
  admin: false,
  owner: false
}
