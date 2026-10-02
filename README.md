# Noah Bot 🤖

A WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys) (`7.0.0-rc14`), written in **TypeScript**. This is a full TypeScript rewrite of the HuaBot-style command bot, with a proper WhatsApp **LID/JID identity fix** so that group tags always mention members as real numbers instead of raw LID IDs like `@23277710033892`.

## Features

- 39 commands across 6 categories: basic, admin, group, fun, media, owner
- Command prefix `!` (configurable via `PREFIX`)
- Local JSON storage in `./data/` (`users.json`, `groups.json`, `settings.json`, `lidmap.json`) — no MongoDB
- LID → phone-number identity resolution:
  1. PN alternate carried in the message key (`participantAlt`)
  2. Baileys' own LID mapping store (`signalRepository.lidMapping`)
  3. Persisted local `lidmap.json` (with automatic migration of user records from LID keys to PN keys)
  4. Raw JID fallback
- Canonical identity (phone number) used for the user database, bans, warnings, premium, profiles and stats
- Pairing-code linking website (no QR needed) + terminal QR fallback

## Setup

```bash
npm install
cp .env.example .env   # edit BOT_NAME, OWNER_NUMBER, PREFIX, etc.
npm start              # tsx src/index.ts
```

On Windows, `saadbot.bat` starts the bot (or `npm start` in PowerShell).

### Link WhatsApp (no QR needed)

When the bot starts it also serves a small linking website at
`http://localhost:3000` (port configurable via `WEB_PORT`):

1. Open the page in your browser
2. Enter your WhatsApp number with country code (digits only, no `+`)
3. Tap **Get pairing code** — an 8-character code appears
4. On your phone: WhatsApp → **Settings → Linked devices → Link a device** →
   **"Link with phone number instead"** → type the code

The page detects when linking succeeds. You only do this once — the session
is saved in `./sessions/` and reused on restart. (Terminal QR still works as
a fallback.)

### Run 24/7 on Railway (public pairing page)

Vercel can't host this bot (serverless — the WhatsApp socket needs a process
that stays alive). Railway keeps it running and gives the pairing page a
public URL your phone can reach:

1. Push this folder to a GitHub repo
2. Railway → **New Project → Deploy from GitHub** → pick the repo
   (it auto-detects the `Dockerfile`)
3. **Variables** tab → add from `.env.example`:
   `BOT_NAME`, `OWNER_NAME`, `PREFIX`, `OWNER`, plus
   `WEB_HOST=0.0.0.0` (leave `PORT` alone — Railway injects it)
4. **Volumes** → add one mounted at `/app/sessions` so the WhatsApp login
   survives restarts (add a second at `/app/data` to keep the user database)
5. Open the public URL Railway gives you → enter your number → link once

Local Docker test: `docker build -t noah-bot . && docker run -p 3000:3000 -e WEB_HOST=0.0.0.0 noah-bot`

## Scripts

| Script        | Command                  |
|---------------|--------------------------|
| `npm start`   | `tsx src/index.ts`       |
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run typecheck` | `tsc --noEmit`     |
| `npm run build` | `tsc`                  |

## Commands

| Category | Commands |
|----------|----------|
| Basic | `!help`, `!info`, `!menu`, `!ping`, `!profile` |
| Admin (group) | `!ban`, `!demote`, `!kick`, `!mute`, `!promote`, `!settings`, `!warn` |
| Group | `!goodbye`, `!groupinfo`, `!hidetag`, `!rules`, `!tagall`, `!welcome` |
| Fun | `!answer`, `!challenge`, `!fortune`, `!joke`, `!meme`, `!riddle`, `!roast`, `!ship`, `!story` |
| Media | `!instagram`, `!play`, `!sticker`, `!tiktok`, `!youtube` |
| Owner | `!banuser`, `!botstat`, `!premium`, `!restart`, `!unbanuser`, `!update`, `!warnsystem` |

Use `!help <command>` for details on any command, and `!menu` for the full categorized list.

## Project structure

```
src/
  index.ts               # Entry point — connection + message wiring
  config.ts              # Env-driven config (prefix, owner, bot name)
  globals.d.ts           # Global type declarations
  core/
    connection.ts        # Baileys socket setup, auth state, QR, reconnect
    messageHandler.ts    # Message parsing, identity resolution, dispatch
    pluginLoader.ts      # Command discovery + loading
    database.ts          # JSON storage: users, groups, settings, lidmap
    types.ts             # Shared TypeScript types
    utils.ts             # formatTime, formatSize, isValidURL, getUptime
  lib/
    jidUtils.ts          # LID/JID identity helpers (isLidJid, resolveToPn,
                         # senderPnFromKey, buildMentionTargets, displayUser…)
  commands/
    admin/ basic/ fun/ group/ media/ owner/   # 39 command plugins
asset/
  logo.jpg               # Logo shown in !menu
data/                    # Created at runtime (JSON storage)
```

## Identity fix notes

WhatsApp now identifies some users by LID (`1234...@lid`) instead of phone-number JIDs (`1234...@s.whatsapp.net`). Every place that touches users — `!tagall`, `!hidetag`, profiles, bans, warnings — resolves through `src/lib/jidUtils.ts`:

- `buildMentionTargets(sock, participants)` — for `!tagall`/`!hidetag`, returns PN-form JIDs and digit-only tags so every member renders as a proper mention, never a raw LID number.
- `displayUser(p)` — safe digit display for any participant.
- `senderPnFromKey(sock, key)` / `resolveToPn(...)` — canonical phone identity for sender checks, bans, warnings, DB records.
- `db.canonicalId(id)` / `db.linkLidPn(lid, pn)` — persists LID↔PN mappings in `lidmap.json` and migrates existing LID-keyed user records to PN keys.

Group admin comparisons use normalized phone digits rather than raw JID equality.

## Dependencies

- `@whiskeysockets/baileys` — 7.0.0-rc14
- `axios`, `pino`, `qrcode-terminal`, `wa-sticker-formatter`
- `typescript`, `tsx`

> [!NOTE]
> The media downloader commands (`!play`, `!instagram`, `!tiktok`, `!youtube`) rely on third-party APIs and may need working endpoints to fetch real media.
