# ShopAgent — WhatsApp AI agent for small businesses
*(working name — rename anytime. Built by Elevate Mavens.)*

## What it is
A WhatsApp agent that answers a shop's customers like the owner would: product questions, prices, delivery, address, catalogue photos, voice notes. Each business gets its own brain, trained on its own facts. No app to install, no dashboard to learn — customers just message the shop's WhatsApp number.

## Pricing
- **PKR 15,000** one-time setup (config, catalog, voice, testing)
- **PKR 1,500/month** hosting and care plan
- **Self-host option:** the owner can run the bot on their own machine/VPS instead — same code, their own Supabase project. Setup fee still applies; no monthly.
- Discount lever: hold the setup firm; the monthly is already lean.

## Privacy (a selling point, not fine print)
- Every business's chats are private to that business. The agency admin panel sees accounts, usage counts, and billing — never message contents.
- Enforced in the database (row-level security), not just promised in the UI.

## Architecture
```
Supabase (Postgres + Auth + Storage)   # the shared backend both sides talk to
├── bot (Node.js, his VM or owner's self-host) — reads config, writes chats/leads
└── dashboard (Next.js, Vercel, his domain)   — per-business login, admin panel
```
- The VM cannot take inbound connections, so Supabase is the bridge: the bot syncs outbound, the dashboard talks to Supabase directly.
- Auth: unique ID + password per business (Supabase Auth). One site, many dashboards, each isolated by row-level security.
- `data/businesses/<biz-id>.json` remains the local fallback when Supabase env is not configured.

## What's in the box (v1)
- Conversational AI brain — answers unscripted questions in Roman Urdu/English, never invents prices or facts
- Voice notes for substantive replies (Fish Audio, cloned voice per business)
- Catalogue images on request
- Transcribes incoming customer voice notes
- Per-business config: products, sizes, prices policy, address, delivery zones, hours, tone, FAQs
- Owner commands: turn the agent on/off per chat, check status, swap voice
- Graceful exits: backs off when the customer says no, re-engages fresh later

## Architecture
```
data/businesses/<biz-id>.json   # one config per business (facts, catalog, voice, tone)
assets/<biz-id>-catalog/        # catalogue images per business
src/lib/shopAgent.ts            # business-agnostic engine (state, intents, voice, catalog)
src/lib/shopBrain.ts            # conversational brain: Claude API -> NVIDIA NIM -> preset fallback
src/commands/owner/shop.ts      # !shop on <biz> / off / status / list
```
- The old T&A demo (`taDemo.ts`, `!tademo`) now runs on this engine with `ta-electronics` as the default business. Nothing the demo could do is lost.
- Brain provider chain: `ANTHROPIC_API_KEY` (Claude, when startup credits land) → `NVIDIA_NIM_API_KEY` (live today) → preset intent brain (always works offline).
- Conversation memory: last 12 turns per chat, fed to the brain so it never repeats questions.

## Rules the brain must never break
- Never invent a price, size, address, or fact not in the business config
- Greet once per conversation; never repeat a question already asked
- One follow-up question max after an answer; ask one thing at a time
- On "no"/"nahi": graceful exit, no pushing
- Short messages: 1–3 lines, Roman Urdu default, match the customer's language

## Roadmap (after v1 ships)
- Web dashboard per business (conversations, toggle, edit catalog/FAQ without touching code)
- Billing integration for the monthly care plan
- Multi-number hosting (one VM, many shops)
