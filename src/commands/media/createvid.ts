// src/commands/media/createvid.ts — AI text-to-video generation.
// Uses Google's Veo video model (the engine behind Google Flow) through the
// Gemini Developer API. Needs a billing-enabled Gemini API key:
//   https://aistudio.google.com/apikey  ->  add GEMINI_API_KEY to .env
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview'
const POLL_INTERVAL_MS = 15_000
const MAX_POLLS = 40 // ~10 minutes max wait

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function startGeneration(apiKey: string, prompt: string): Promise<string> {
  const url = `${API_BASE}/models/${MODEL}:predictLongRunning`
  const { data } = await axios.post(
    url,
    {
      instances: [{ prompt }],
      parameters: {
        aspectRatio: '9:16', // vertical, short-form / viral style
        durationSeconds: 8,
        resolution: '720p'
      }
    },
    { headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 60_000 }
  )
  if (!data?.name) throw new Error('API returned no operation name')
  return data.name as string
}

async function pollOperation(apiKey: string, operationName: string): Promise<string> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS)
    const { data } = await axios.get(`${API_BASE}/${operationName}`, {
      headers: { 'x-goog-api-key': apiKey },
      timeout: 30_000
    })

    if (data?.error) {
      throw new Error(`Video generation failed: ${JSON.stringify(data.error).slice(0, 200)}`)
    }

    if (data?.done) {
      const uri =
        data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
      if (typeof uri === 'string' && uri.length) return uri
      throw new Error('Generation finished but no video URL was returned')
    }
  }
  throw new Error('Generation is taking too long (timed out after ~10 min). Try again later.')
}

async function downloadVideo(apiKey: string, uri: string): Promise<Buffer> {
  const { data } = await axios.get(uri, {
    headers: { 'x-goog-api-key': apiKey },
    responseType: 'arraybuffer',
    timeout: 120_000,
    maxBodyLength: 128 * 1024 * 1024
  })
  return Buffer.from(data)
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const prompt = args.join(' ').trim()

  if (!prompt) {
    return m.reply(
      '🎬 *!createvid* <describe your video>\n\nExample:\n*!createvid a robot dancing in the rain at night, cinematic lighting*\n\nThe bot renders an 8-second vertical AI video (Veo). It takes ~1-3 minutes.'
    )
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return m.reply(
      '🎬 Video generation is set up but needs an API key.\n\n' +
      'Ask the owner to:\n' +
      '1. Get a *paid* Gemini API key at https://aistudio.google.com/apikey\n' +
      '2. Add `GEMINI_API_KEY=...` to the bot\'s `.env` and restart the bot.\n\n' +
      'Then `!createvid` will work.'
    )
  }

  if (prompt.length > 2000) {
    return m.reply('❌ Keep the prompt under 2000 characters.')
  }

  try {
    await m.reply('🎬 Generating your video with Veo AI… this usually takes 1-3 minutes. I\'ll send it as soon as it\'s ready.')

    const operationName = await startGeneration(apiKey, prompt)
    const uri = await pollOperation(apiKey, operationName)
    const video = await downloadVideo(apiKey, uri)

    await sock.sendMessage(m.chat, {
      video,
      mimetype: 'video/mp4',
      caption: `🎬 *AI Video*\n${prompt.slice(0, 200)}`
    }, { quoted: m.message })
  } catch (error: any) {
    console.error('createvid error:', error?.message || error)
    const status = error?.response?.status
    if (status === 400 || status === 403) {
      const detail = error?.response?.data?.error?.message || error?.message
      return m.reply(`❌ Video API error (${status}): ${String(detail).slice(0, 300)}\n\nThis usually means the API key is missing billing/quota.`)
    }
    if (status === 429) {
      return m.reply('❌ Video API quota is exhausted right now. Try again later.')
    }
    m.reply(`❌ Couldn't generate that video: ${String(error?.message || error).slice(0, 300)}`)
  }
}

export default {
  pattern: /^(createvid|aivideo|makevideo)$/i,
  handler,
  help: 'Generate an 8-second vertical AI video from a text prompt (Google Veo)',
  usage: '!createvid <describe your video>',
  example: '!createvid a robot dancing in the rain at night',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
