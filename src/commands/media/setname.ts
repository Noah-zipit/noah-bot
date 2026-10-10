import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type Database from '../../core/database.js'

const STORE_KEY = 'stickerNames'

export interface StickerName {
  pack: string
  author: string
}

/** Load the saved sticker pack name for a sender JID, if any. */
export function getSavedStickerName(db: Database, senderJid: string): StickerName | undefined {
  const store = db.data.settings[STORE_KEY] as Record<string, StickerName> | undefined
  return store?.[senderJid]
}

const handler = async (m: ParsedMessage, { db, args }: CommandContext) => {
  const raw = args.join(' ').trim()
  const sender = m.sender

  const store = (db.data.settings[STORE_KEY] as Record<string, StickerName> | undefined) ?? {}
  if (!db.data.settings[STORE_KEY]) db.data.settings[STORE_KEY] = store

  // !setname -> show current
  if (!raw) {
    const cur = store[sender]
    return m.reply(
      cur
        ? `*Your sticker name*\nPack: ${cur.pack}\nAuthor: ${cur.author}\n\nChange it with *!setname My Pack | Ashar*, clear with *!setname reset*`
        : 'No sticker name saved yet.\n\nSave one with: *!setname My Pack | Ashar* (the part after | is optional)'
    )
  }

  // !setname reset -> clear
  if (/^reset$/i.test(raw)) {
    delete store[sender]
    db.save('settings')
    return m.reply('Sticker name cleared — stickers go back to the default name.')
  }

  // !setname My Pack | Ashar  (comma works as separator too)
  const parts = raw.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
  const pack = parts[0]
  const author = parts[1] || pack
  if (!pack) {
    return m.reply('Usage: *!setname My Pack Name | Author Name*')
  }

  store[sender] = { pack, author }
  db.save('settings')
  return m.reply(
    `Saved. Every sticker you make now carries:\nPack: *${pack}*\nAuthor: *${author}*\n\n_Overriding one sticker: !sticker Other Pack | Ashar_`
  )
}

export default {
  pattern: /^(setname|stickername)$/i,
  handler,
  help: 'Save your own sticker pack name',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
