// src/commands/media/image.ts — convert a sticker to an image, or resend a quoted/sent image at full size
import sharp from 'sharp'
import type { ParsedMessage, CommandContext, MediaDownloadResult } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  try {
    let mediaMsg: { type: string; download?: () => Promise<MediaDownloadResult | null> } | undefined

    if (['imageMessage', 'stickerMessage'].includes(m.type)) {
      mediaMsg = m
    } else if (m.quoted && ['imageMessage', 'stickerMessage'].includes(m.quoted.type)) {
      mediaMsg = m.quoted
    } else {
      return m.reply('🖼️ Reply to a sticker or image with *!image* (or send one with caption *!image*) and I\'ll convert it to an image.')
    }

    await m.reply(global.mess.wait)

    const media = await mediaMsg.download?.()
    const buffer = (media as any)?.buffer as Buffer | undefined
    if (!buffer || !buffer.length) {
      return m.reply('❌ Could not download that media. Try again.')
    }

    if (mediaMsg.type === 'stickerMessage') {
      // Stickers are webp (sometimes animated) — convert to a plain jpg image
      const jpg = await sharp(buffer, { animated: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toBuffer()
      await sock.sendMessage(m.chat, {
        image: jpg,
        mimetype: 'image/jpeg',
        caption: '🖼️ Sticker converted to image'
      }, { quoted: m.message })
      return
    }

    // Send as a document so WhatsApp does not recompress it — true full size
    await sock.sendMessage(m.chat, {
      document: buffer,
      mimetype: 'image/jpeg',
      fileName: `noahbot-full-${Date.now()}.jpg`,
      caption: '🖼️ Full-size image (uncompressed)'
    }, { quoted: m.message })
  } catch (error) {
    console.error('image error:', error)
    m.reply('❌ Failed to process that image.')
  }
}

export default {
  pattern: /^(image|fullimage|hdimage)$/i,
  handler,
  help: 'Convert a sticker to an image, or resend a quoted image at full size',
  usage: '!image (reply to a sticker/image)',
  example: '!image',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
