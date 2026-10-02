import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { CommandPlugin } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Load all plugins from the commands directory
 */
export async function loadPlugins(): Promise<Record<string, CommandPlugin>> {
  const plugins: Record<string, CommandPlugin> = {}
  const commandsDir = path.join(__dirname, '../commands')

  // Check if commands directory exists
  if (!fs.existsSync(commandsDir)) {
    console.error('Commands directory not found')
    return plugins
  }

  // Get all subdirectories
  const categories = fs.readdirSync(commandsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  // Load plugins from each category
  for (const category of categories) {
    const categoryDir = path.join(commandsDir, category)
    const files = fs.readdirSync(categoryDir).filter(file => file.endsWith('.ts') || file.endsWith('.js'))

    for (const file of files) {
      const pluginId = `${category}/${file}`
      try {
        const filePath = path.join(categoryDir, file)
        const fileUrl = pathToFileURL(filePath).href

        // Timestamp query busts the ESM import cache for hot reloading
        const module = (await import(`${fileUrl}?update=${Date.now()}`)) as { default?: unknown }

        const plugin = (module.default ?? module) as Partial<CommandPlugin>
        if (!plugin || typeof plugin.handler !== 'function' || !(plugin.pattern instanceof RegExp)) {
          console.error(`Invalid plugin export in ${pluginId}, skipping`)
          continue
        }

        plugins[pluginId] = {
          ...(plugin as Record<string, unknown>),
          name: file.replace(/\.(ts|js)$/, ''),
          category,
          filename: file
        } as CommandPlugin

        console.log(`Loaded plugin: ${pluginId}`)
      } catch (e) {
        console.error(`Error loading plugin ${file}:`, e)
      }
    }
  }

  return plugins
}

/**
 * Reload all plugins
 */
export async function reloadPlugins(): Promise<Record<string, CommandPlugin>> {
  global.plugins = {}
  return loadPlugins()
}
