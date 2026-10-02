import { Sticker } from 'wa-sticker-formatter'
import type { ParsedMessage, CommandContext, MediaDownloadResult } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  try {
    // Check if media message or quoted message
    let mediaMsg: { type: string; download?: () => Promise<MediaDownloadResult | null> } | undefined

    if (m.type === 'imageMessage' || m.type === 'videoMessage') {
      mediaMsg = m
    } else if (m.quoted && (m.quoted.type === 'imageMessage' || m.quoted.type === 'videoMessage')) {
      mediaMsg = m.quoted
    } else {
      return m.reply('Reply to an image or video to create a sticker, or send an image with caption *!sticker*')
    }

    // Show processing message
    await m.reply(global.mess.wait)

    // Get media type
    const isVideo = mediaMsg.type === 'videoMessage'

    // Download media
    const media = await mediaMsg.download?.()
    if (!media) {
      return m.reply('Failed to download media. Try again with a different image/video.')
    }

    // Create sticker
    const stickerOptions = {
      pack: args[0] || 'Noah Bot',
      author: args[1] || 'Noah Bot',
      type: isVideo ? 'full' : 'default',
      categories: ['🌸', '⚔️'],
      id: Date.now().toString(),
      quality: 70
    }

    const sticker = new Sticker(media.buffer, stickerOptions as any)
    const stickerBuffer = await sticker.toBuffer()

    // Send sticker
    await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m.message })


  } catch (error) {
    console.error('Error creating sticker:', error)
    m.reply('Failed to create sticker. A true martial artist would provide better materials.')
  }
}

export default {
  pattern: /^(s|sticker|stiker|seal)$/i,
  handler,
  help: 'Convert image/video to sticker',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
