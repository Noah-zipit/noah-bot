// src/commands/media/play.ts — Song downloader via local JioSaavn API (audio only)
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const API = process.env.JIOSAAVN_API || 'http://127.0.0.1:3100'

interface SaavnSong {
  id: string
  name: string
  duration?: number
  artists?: { primary?: { name: string }[] }
  album?: { name: string }
  image?: { quality: string; url: string }[]
  downloadUrl?: { quality: string; url: string }[]
}

async function searchSongs(query: string): Promise<SaavnSong[]> {
  const res = await axios.get(`${API}/api/search/songs`, {
    params: { query, limit: 5 },
    timeout: 20000
  })
  const results = res.data?.data?.results
  return Array.isArray(results) ? results : []
}

async function getSongDetails(id: string): Promise<SaavnSong | null> {
  const res = await axios.get(`${API}/api/songs/${id}`, { timeout: 20000 })
  const data = res.data?.data
  const song = Array.isArray(data) ? data[0] : data
  return song || null
}

function bestDownloadUrl(song: SaavnSong): string | null {
  const urls = song.downloadUrl
  if (!Array.isArray(urls) || !urls.length) return null
  // Prefer highest quality (320kbps), fall back to whatever exists
  const sorted = [...urls].sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
  return sorted[0]?.url || null
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const query = args.join(' ').trim()
  if (!query) {
    return m.reply('Usage: *!play <song name>*\nExample: *!play despacito*')
  }

  try {
    m.react('🔍')
    await m.reply('🔍 *Searching...*')

    const results = await searchSongs(query).catch(() => null)
    if (!results || !results.length) {
      return m.reply('❌ Could not find that song. Try a different name.')
    }

    const top = results[0]
    const details = await getSongDetails(top.id).catch(() => null)
    const song = details || top
    const url = bestDownloadUrl(song)
    if (!url) return m.reply('❌ Found the song but no download link is available.')

    const artist = song.artists?.primary?.map(a => a.name).join(', ') || ''
    const title = [song.name, artist].filter(Boolean).join(' — ')
    const thumb = song.image?.length ? song.image[song.image.length - 1].url : undefined

    m.react('🎵')
    await m.reply(`🎵 *${title}*\n_Sending audio..._`)
    if (thumb) {
      await sock.sendMessage(m.chat, { image: { url: thumb }, caption: `🎵 *${title}*` }, { quoted: m.message }).catch(() => {})
    }

    await sock.sendMessage(m.chat, {
      audio: { url },
      mimetype: 'audio/mp4',
      fileName: `${title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}.m4a`
    }, { quoted: m.message })
  } catch (error) {
    console.error('play error:', error)
    m.reply('❌ Something went wrong while processing your request.')
  }
}

export default {
  pattern: /^(play|song|music|mp3)$/i,
  handler,
  help: 'Search and download a song as audio (JioSaavn)',
  usage: '!play <song name>',
  example: '!play despacito',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
