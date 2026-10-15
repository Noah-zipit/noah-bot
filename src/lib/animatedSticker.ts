/**
 * Purpose-built animated sticker encoder.
 *
 * Why this exists: wa-sticker-formatter's video path (mp4 -> ffmpeg default
 * gif -> sharp webp) produced multi-MB animated webps. Anything over
 * WhatsApp's ~500KB animated-sticker ceiling arrives as a static first
 * frame, and upscaling small GIFs to 512 blurred them. This encoder goes
 * straight from the source (mp4/gif/webp) to animated webp via ffmpeg's
 * libwebp_anim, never upscales small sources, and walks a ladder until the
 * output fits comfortably under the limit.
 *
 * Quality strategy (2026-10-15 rework — "video stickers are not crystal
 * clear, really badly encoded"):
 *  1. Duration is the dominant size lever for video, so videos longer than
 *     VIDEO_TRIM_SECONDS are pre-trimmed to the first 5 seconds BEFORE the
 *     ladder. A crisp 5s sticker at 512px/15fps/q84 beats a mushy full-length
 *     one at 384px/10fps/q70 every time — and every major sticker app trims
 *     to a short loop anyway. GIFs are left alone (they are already short).
 *  2. The ladder starts at quality 88 and holds 512px/15fps through the first
 *     three rungs, shedding size via fps, then width, then duration — in that
 *     order. Quality is the LAST thing sacrificed, never the first. (Earlier
 *     versions started at q75 and dropped to 448px by rung 4 on ordinary
 *     busy phone video — that was the "badly encoded" look.)
 *  3. Deeper rungs exist for pathological content, but trimming happens
 *     before resolution/fps collapse, so the common case never sees them.
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

// Videos longer than this are trimmed to their first N seconds before the
// quality ladder runs. Duration dominates output size for video, so this is
// what lets ordinary phone clips stay on the 512px / 15fps / high-quality
// rungs instead of collapsing to 384px mush.
const VIDEO_TRIM_SECONDS = 5

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
  const out = Buffer.from(await img.save(null))
  // node-webpmux recomputes the VP8X feature flags on save and drops the
  // animation bit — WhatsApp then shows the sticker as a static image, which
  // is why GIF stickers stopped moving once names were stamped in. Restore
  // the source's original flags and set the EXIF bit (0x04) for the chunk
  // we just appended.
  const vp8x = out.indexOf('VP8X')
  if (vp8x >= 0 && out.length > vp8x + 8 && webp.length > vp8x + 8) {
    out[vp8x + 8] = webp[vp8x + 8] | 0x04
  }
  return out
}

interface SourceProbe {
  fps: number | null
  duration: number | null
  format: string | null
}

/**
 * Probe the source once: average frame rate, duration, container format.
 * Any field may come back null when it can't be determined.
 */
async function probeSource(input: string): Promise<SourceProbe> {
  const probe: SourceProbe = { fps: null, duration: null, format: null }
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0',
       '-show_entries', 'stream=avg_frame_rate:format=duration,format_name',
       '-of', 'default=nw=1', input],
      { timeout: 30_000 }
    )
    for (const line of stdout.split('\n')) {
      const [k, v] = line.split('=')
      if (k === 'avg_frame_rate' && v) {
        const [n, d] = v.trim().split('/').map(Number)
        if (n > 0 && d > 0) probe.fps = n / d
      } else if (k === 'duration' && v) {
        const s = Number(v)
        if (Number.isFinite(s) && s > 0) probe.duration = s
      } else if (k === 'format_name' && v) {
        probe.format = v.trim().toLowerCase()
      }
    }
  } catch {
    // probe failed — fall through with nulls and safe defaults below
  }
  return probe
}

const VIDEO_FORMAT_TOKENS = new Set([
  'mp4', 'mov', 'm4a', 'm4v', '3gp', '3g2', 'mj2',
  'matroska', 'webm', 'avi', 'flv', 'mpeg', 'mpegts'
])

/**
 * True when the source is a video container (not a GIF / still webp).
 * Only videos get the pre-trim — GIFs are already short loops.
 */
function isVideoSource(probe: SourceProbe, ext: string): boolean {
  if (probe.format) {
    const tokens = probe.format.split(',')
    if (tokens.some((t) => VIDEO_FORMAT_TOKENS.has(t))) return true
    if (tokens.includes('gif')) return false
  }
  return ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.3gp', '.avi'].includes(ext.toLowerCase())
}

// Quality ladder: quality is the LAST thing sacrificed, never the first.
// Earlier versions opened at q75 and were already down to 448px/10fps by
// rung 4 on ordinary busy phone video — that was the "badly encoded" look
// users reported. Now the first three rungs hold full 512px/15fps and walk
// quality down from 88; size is then shed through fps, then width, then
// duration, in that order. Deep rungs exist only for pathological content —
// the 5s pre-trim above keeps real videos on the early rungs.
type Attempt = { fps: number; quality: number; maxWidth: number; maxSeconds?: number }

const LADDER: Attempt[] = [
  { fps: 15, quality: 88, maxWidth: 512 },
  { fps: 15, quality: 84, maxWidth: 512 },
  { fps: 15, quality: 80, maxWidth: 512 },
  { fps: 12, quality: 80, maxWidth: 512 },
  { fps: 12, quality: 78, maxWidth: 448 },
  { fps: 10, quality: 78, maxWidth: 448 },
  { fps: 10, quality: 75, maxWidth: 384 },
  { fps: 8, quality: 72, maxWidth: 384, maxSeconds: 4 },
  { fps: 8, quality: 68, maxWidth: 320, maxSeconds: 3 },
]

// NOTE: the fps step below DOWNSAMPLES only — never forces a low-fps GIF
// up to the target rate. Duplicating frames to reach 15fps made stickers
// visibly "double"/stutter and ate the bytes clarity needed.

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
    // Probe once: knowing the source fps lets the fps filter downsample
    // fast sources and pass slow ones through untouched (no frame doubling);
    // knowing the duration lets long videos get pre-trimmed.
    const probe = await probeSource(inp)

    // Videos: trim to the first VIDEO_TRIM_SECONDS before encoding.
    // Duration is the dominant size lever — this single step is what keeps
    // real phone videos on the crisp 512px rungs instead of collapsing the
    // ladder. Stream copy is near-instant; on failure fall back to the full
    // input and let the ladder handle it.
    let encodeInput = inp
    if (
      isVideoSource(probe, safeExt) &&
      probe.duration !== null &&
      probe.duration > VIDEO_TRIM_SECONDS
    ) {
      const trimmed = join(dir, `trim${safeExt}`)
      try {
        await execFileAsync(
          'ffmpeg',
          ['-v', 'error', '-y', '-t', String(VIDEO_TRIM_SECONDS), '-i', inp,
           '-c', 'copy', '-an', trimmed],
          { timeout: 60_000 }
        )
        encodeInput = trimmed
      } catch {
        // keep the full input; the ladder sheds size another way
      }
    }

    let smallest: Buffer | null = null
    for (const a of LADDER) {
      const out = join(dir, `out-${a.fps}-${a.quality}-${a.maxWidth}${a.maxSeconds ? '-trim' : ''}.webp`)
      // Never upscale: min(maxWidth,iw) keeps small GIFs at native resolution
      // (upscaling is what made them blurry). -2 keeps height even.
      const filters: string[] = []
      if (probe.fps === null || probe.fps > a.fps) filters.push(`fps=${a.fps}`)
      filters.push(`scale='min(${a.maxWidth},iw)':-2:flags=lanczos`)
      const vf = filters.join(',')
      const args = ['-v', 'error', '-y', '-i', encodeInput]
      if (a.maxSeconds) args.push('-t', String(a.maxSeconds))
      args.push(
        '-vf', vf,
        '-vcodec', 'libwebp_anim',
        '-lossless', '0',
        '-quality', String(a.quality),
        // Digital-picture preset: sharper edges, less blockiness than the
        // default preset, and ~6% smaller at the same quality on busy
        // motion (measured). One rung of size headroom for free.
        '-preset', 'picture',
        // Conditional replenishment: skips re-encoding near-static blocks,
        // so GIFs with still regions use fewer bytes and can stay on the
        // early rungs. (It does nothing for full-motion content — for those
        // the fps/width rungs below are what bring the size down.)
        '-cr_threshold', '4',
        '-cr_size', '16',
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
