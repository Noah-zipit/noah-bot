# ShopAgent — self-host guide

Run the WhatsApp shop-agent bot on your own machine or VPS. Your chats stay
on your own infrastructure; nothing is read by anyone else.

## What you need
- Node.js 20+
- A WhatsApp number for the bot (a spare number works best)
- Optional: a Supabase project (free tier) for the dashboard + multi-device sync.
  Without it the bot runs in **local JSON mode** — same features, configs in
  `data/businesses/*.json`, no dashboard.

## Setup
```bash
npm ci
npm run build
```

## Environment
Copy and fill in (never commit this file):

```bash
# Supabase (optional — skip for local JSON mode)
SUPABASE_URL=https://xyzcompany.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI brain (optional — without keys the bot uses its built-in preset brain)
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-sonnet-4-5
NVIDIA_NIM_API_KEY=nvapi-...

# Voice notes (optional — Fish Audio; text replies always work)
# FISH_VOICE_ID=...

# Paths / ports
DATA_DIR=/path/to/data        # default: ./data
WEB_PORT=3000                 # pairing page + health
```

Apply `~/workspace/shopagent-dashboard/supabase/schema.sql` in your Supabase
SQL editor once (idempotent), then create one row per business in the
`businesses` table — or keep editing `data/businesses/*.json`.

## Pairing WhatsApp
```bash
npm start
```
Open `http://127.0.0.1:3000` (or your `WEB_PORT`) and link the number with the
pairing code, exactly like WhatsApp Web.

## Running 24/7 (pm2)
```bash
npm i -g pm2
pm2 start dist/index.js --name shopagent
pm2 save
pm2 startup   # follow the printed instructions
```

## Owner commands (in your own DM with the bot)
- `!shop list` — businesses on this bot
- `!shop on <biz-id>` / `!shop off` — enable the agent in a customer chat
- `!shop status` — what is on where
- `!broadcast <biz-id> <text>` — message recent customers (max 30, 2s apart)
- `!tademo on|off` — legacy alias for the T&A demo business

## Notes
- Conversation memory is per chat (last 12 turns) and stored locally in
  `data/shop-state.json`, mirrored to Supabase when configured.
- The bot never invents prices or facts — every answer comes from the
  business config or the AI brain grounded on it.
- To update: `git pull && npm ci && npm run build && pm2 restart shopagent`.
