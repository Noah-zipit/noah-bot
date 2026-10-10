/**
 * Purpose-built animated sticker encoder.
 *
 * Why this exists: wa-sticker-formatter's video path (mp4 -> ffmpeg default
 * gif -> sharp webp) produced multi-MB animated webps. Anything over
 * WhatsApp's ~500KB animated-sticker ceiling arrives as a static first
 * frame, and upscaling small GIFs to 512 blurred them. This encoder goes
 * straight from the source (mp4/gif/webp) to animated webp via ffmpeg's
 * libwebp_anim, never upscales small sources, and walks a quality ladder
 * until the output fits comfortably under the limit.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import webpmux from 'node-webpmux'
const { Image } = webpmux

const execFileAsync = promisify(execFile)

// WhatsApp's animated-sticker ceiling is ~500KB; stay comfortably under it.
const MAX_BYTES = 450 * 1024

/**
 * Pack/author metadata carried inside the sticker's EXIF chunk.
 * This is what WhatsApp reads to show the pack name under the sticker.
 */
export interface StickerMetadata {
  id: string
  pack: string
  author: string
  emojis?: string[]
}

/**
 * Build the WhatsApp sticker EXIF payload (same layout wa-sticker-formatter uses).
 */
function buildStickerExif(meta: StickerMetadata): Buffer {
  const data = JSON.stringify({
    'sticker-pack-id': meta.id,
    'sticker-pack-name': meta.pack,
    'sticker-pack-publisher': meta.author,
    emojis: meta.emojis ?? []
  })
  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x16, 0x00, 0x00, 0x00
    ]),
    Buffer.from(data, 'utf-8')
  ])
  exif.writeUIntLE(Buffer.byteLength(data, 'utf-8'), 14, 4)
  return exif
}

/**
 * Stamp pack/author metadata into an existing webp buffer's EXIF chunk.
 * Preserves animation — this is the piece the ffmpeg path never had, which is
 * why GIF stickers showed no name underneath while static ones did.
 */
export async function addStickerMetadata(webp: Buffer, meta: StickerMetadata): Promise<Buffer> {
  const img = new Image()
  await img.load(webp)
  img.exif = buildStickerExif(meta)
  const out = await img.save(null)
  return Buffer.from(out)
}

type Attempt = { fps: number; quality: number; maxSeconds?: number }

// Quality ladder: try the best first, degrade gracefully until it fits.
const LADDER: Attempt[] = [
  { fps: 15, quality: 75 },
  { fps: 12, quality: 60 },
  { fps: 10, quality: 50 },
  { fps: 10, quality: 40, maxSeconds: 4 },
]

/**
 * Encode an animated source buffer (mp4 / gif / animated webp) into an
 * animated webp sticker that WhatsApp will actually animate.
 * @param input raw media bytes
 * @param ext file extension hint for the input ('.mp4' | '.gif' | '.webp')
 */
export async function makeAnimatedSticker(input: Buffer, ext: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'animsticker-'))
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`
  const inp = join(dir, `in${safeExt}`)
  await writeFile(inp, input)

  try {
    let smallest: Buffer | null = null
    for (const a of LADDER) {
      const out = join(dir, `out-${a.fps}-${a.quality}${a.maxSeconds ? '-trim' : ''}.webp`)
      // Never upscale: min(512,iw) keeps small GIFs at native resolution
      // (upscaling is what made them blurry). -2 keeps height even.
      const vf = [`fps=${a.fps}`, `scale='min(512,iw)':-2:flags=lanczos`].join(',')
      const args = ['-v', 'error', '-y', '-i', inp]
      if (a.maxSeconds) args.push('-t', String(a.maxSeconds))
      args.push(
        '-vf', vf,
        '-vcodec', 'libwebp_anim',
        '-lossless', '0',
        '-quality', String(a.quality),
        '-loop', '0',
        '-an', '-vsync', '0',
        out
      )
      await execFileAsync('ffmpeg', args, { timeout: 120_000 })
      const buf = await readFile(out)
      if (!smallest || buf.length < smallest.length) smallest = buf
      if (buf.length <= MAX_BYTES) return buf
    }
    // Even the smallest attempt is oversized — return the smallest we got
    // rather than nothing; it still animates on most clients.
    if (!smallest) throw new Error('animated sticker encode produced no output')
    return smallest
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
