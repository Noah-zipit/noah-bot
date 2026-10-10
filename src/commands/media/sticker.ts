import { Sticker } from 'wa-sticker-formatter'
import { fileTypeFromBuffer } from 'file-type'
import { makeAnimatedSticker } from '../../lib/animatedSticker.js'
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

    // Animated detection: videos, GIFs and animated webp keep their motion
    // through the purpose-built encoder (wa-sticker-formatter's video path
    // produced multi-MB webps that WhatsApp froze, and upscaled small GIFs
    // which blurred them). Static images keep the wa-sticker-formatter path.
    let isAnimated = isVideo
    let animExt = '.mp4'
    try {
      const ft = await fileTypeFromBuffer(media.buffer)
      if (ft && (ft.mime === 'image/gif' || ft.mime === 'image/webp' || ft.mime.startsWith('video'))) {
        isAnimated = true
        animExt = ft.mime === 'image/gif' ? '.gif' : ft.mime === 'image/webp' ? '.webp' : '.mp4'
      }
    } catch { /* fall through to static path */ }

    // Create sticker
    let stickerBuffer: Buffer
    if (isAnimated) {
      stickerBuffer = await makeAnimatedSticker(media.buffer, animExt)
    } else {
      const stickerOptions = {
        pack: args[0] || 'Noah Bot',
        author: args[1] || 'Noah Bot',
        type: 'default',
        categories: ['🌸', '⚔️'],
        id: Date.now().toString(),
        quality: 70
      }

      const sticker = new Sticker(media.buffer, stickerOptions as any)
      stickerBuffer = await sticker.toBuffer()
    }

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
