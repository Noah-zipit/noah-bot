import { Sticker } from 'wa-sticker-formatter'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const MAX_STICKERS = 10
const TELEGRAM_FILE_URL = 'https://api.telegram.org/file/bot'

/**
 * Download a Telegram sticker pack as WhatsApp stickers.
 * Usage: !tgsticker <telegram sticker pack link>
 * Requires TELEGRAM_BOT_TOKEN in the environment (any bot from @BotFather works).
 */
const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return m.reply(
      `*Telegram sticker download isn't configured yet, Sir.*\n\n` +
      `It needs a Telegram bot token (any bot made with @BotFather works):\n` +
      `1. Open Telegram and message @BotFather → /newbot\n` +
      `2. Copy the token it gives you\n` +
      `3. Ask Eviee to add TELEGRAM_BOT_TOKEN=<the token> to the bot's environment\n\n` +
      `Once that's set, use: !tgsticker <sticker pack link>`
    )
  }

  const input = (args[0] || '').trim()
  if (!input) {
    return m.reply(
      `*Usage:* !tgsticker <telegram sticker pack link>\n\n` +
      `Example: !tgsticker https://t.me/addstickers/MyFavoritePack\n` +
      `You can also pass just the pack name: !tgsticker MyFavoritePack`
    )
  }

  // Extract the pack name from a t.me/addstickers/<name> link or use the raw input
  let packName = input
  const linkMatch = input.match(/(?:t\.me\/addstickers\/|t\.me\/)([A-Za-z0-9_]+)/i)
  if (linkMatch) packName = linkMatch[1]

  try {
    await m.reply(global.mess.wait)

    // 1. Fetch the sticker set metadata
    const setRes = await fetch(`https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(packName)}`)
    const setData = await setRes.json() as { ok: boolean; description?: string; result?: { name: string; title: string; stickers: any[] } }
    if (!setData.ok || !setData.result) {
      return m.reply(
        `Couldn't find that sticker pack. ${setData.description || 'Check the link and try again.'}`
      )
    }

    const { title, stickers } = setData.result
    if (!stickers || stickers.length === 0) {
      return m.reply('That sticker pack appears to be empty.')
    }

    // 2. Resolve file paths (Telegram downloads require the bot token)
    const targets = stickers.slice(0, MAX_STICKERS)
    const resolved: { fileId: string; url: string; animated: boolean }[] = []
    for (const st of targets) {
      const fileId = st.file_id as string
      const isAnimated = st.is_animated === true || st.is_video === true
      const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
      const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } }
      if (fileData.ok && fileData.result?.file_path) {
        resolved.push({ fileId, url: `${TELEGRAM_FILE_URL}${token}/${fileData.result.file_path}`, animated: isAnimated })
      }
    }

    if (resolved.length === 0) {
      return m.reply('Failed to download any stickers from that pack. Try again later.')
    }

    await m.reply(`*Pack:* ${title}\nSending ${resolved.length} sticker${resolved.length > 1 ? 's' : ''} — tap any sticker and star it to add it to your WhatsApp collection ⭐`)

    // 3. Download + convert each sticker and send it
    let sent = 0
    for (const file of resolved) {
      try {
        const dl = await fetch(file.url)
        if (!dl.ok) continue
        const buffer = Buffer.from(await dl.arrayBuffer())

        const sticker = new Sticker(buffer, {
          pack: title.slice(0, 60) || 'Telegram Pack',
          author: 'Telegram → WhatsApp',
          type: file.animated ? 'full' : 'default',
          categories: ['🌸'],
          id: `${Date.now()}-${file.fileId}`,
          quality: 70
        } as any)
        const stickerBuffer = await sticker.toBuffer()

        await sock.sendMessage(m.chat, { sticker: stickerBuffer })
        sent++
        // small delay to avoid flooding
        await new Promise(r => setTimeout(r, 800))
      } catch (e) {
        console.error('tgsticker: failed on one sticker', e)
      }
    }

    const totalNote = stickers.length > MAX_STICKERS
      ? `\n\n_Note: the pack has ${stickers.length} stickers; I sent the first ${MAX_STICKERS}. Run the command again with the pack name to get the next batch? Not yet — that paging isn't built. Send the link to a smaller pack instead._`
      : ''

    await m.reply(
      `*Done.* Sent ${sent} sticker${sent === 1 ? '' : 's'} from *${title}*.\n\n` +
      `To add them to your WhatsApp sticker collection, tap a sticker → Add to favorites ⭐.${totalNote}`
    )
  } catch (error) {
    console.error('Error in tgsticker command:', error)
    m.reply('Saad Bot failed to fetch that Telegram sticker pack. Check the link and try again.')
  }
}

export default {
  pattern: /^(tgsticker|telegramsticker|tgs|stickpack|packsticker)$/i,
  handler,
  help: 'Download Telegram sticker pack as WhatsApp stickers',
  usage: '!tgsticker <telegram sticker link>',
  example: '!tgsticker https://t.me/addstickers/MyFavoritePack',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
