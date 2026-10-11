# Claude Brain — T&A demo bot build plan (flagship step 1)

Status: plan only, drafted 2026-10-11 ~10:05 PKT. No code changed yet. Build starts on Ashar's go.

## What exists today (~/workspace/noah-bot/src/lib/taDemo.ts)

- `presetBrain(rawText, st)` — the ACTIVE brain. Stateful, rule-based, zero AI. Greets once, qualifies size/city, deflects prices ("fresh rate confirm karke"), graceful exit on no/nai. Verified working on the +27 instance.
- `aiAnswer(userText)` — NVIDIA NIM call (`meta/llama-3.2-11b-vision-instruct`) with a solid `SHOP_SYSTEM` prompt. Stateless, currently UNUSED (kept as fallback).
- `handleTaDemoMessage` — pipeline: incoming voice note → Fish ASR transcribe → brain → text reply → Fish TTS voice note for replies >25 chars → 3 catalogue images when triggered.
- Per-chat state persists in `data/ta-demo.json` (flags only: greeted/askedSize/askedCity/size/ended).

## The swap

New dispatcher `brain(chatKey, userText)`:

1. **Claude** — primary, when `ANTHROPIC_API_KEY` is set (a key IS present in this VM's environment; validity unconfirmed — verify with one cheap test call at build time).
2. **NIM** — existing `aiAnswer`, upgraded to take conversation history. Fallback when Claude is unset/fails.
3. **`presetBrain`** — hard floor. If both LLM calls fail, the demo answers from rules. It never goes silent.

## Code changes (taDemo.ts only)

1. **History**: extend per-chat state with a `history` ring buffer — last 10 messages (`{role, text}`), persisted in ta-demo.json alongside the flags. Trim on save.
2. **`claudeAnswer(history)`**: POST `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`; body `{ model: <haiku, exact id confirmed from his Claude Console at build time>, max_tokens: 300, temperature: 0.7, system: SHOP_SYSTEM_V2, messages: history }`; 25s abort timeout; return trimmed text or null on any failure.
3. **`SHOP_SYSTEM_V2`**: keep the real shop facts (sizes 19–105, Wahdat Road address, 0333-4804778 / 0321-4495144, same-day Lahore delivery), Roman Urdu, 1–3 lines, greet once (history makes this natural), one question at a time, graceful exit on no/nai, NEVER invent a price — deflect to "fresh rate confirm karke". Add: when the customer wants pictures/catalogue, append the marker `[CATALOG]` to the reply.
4. **Catalogue trigger**: handler strips `[CATALOG]` from the reply text and calls the existing `sendCatalog`. Voice-note flow (>25 chars → Fish TTS) stays untouched.
5. **Build**: compile with the repo's existing tsc (dist/ is the build output), restart instance 1 only (port 3000, +27 number), test from his own number with `!tademo on`, then commit + push to Noah-zipit/noah-bot.

## Cost (order of magnitude, confirm in his Claude Console at build time)

Haiku-class is the cheap tier (~$1 input / $5 output per million tokens). A 20-turn demo conversation is on the order of a few cents. This is a shop demo, not a reason to reach for the expensive models.

## Decisions that stay with him

1. **Go / no-go on the build** — the flagship order says this is step 1, but the build session is his call.
2. **Haiku vs Sonnet** — recommend Haiku (cheap, fast, plenty for a shop bot). Sonnet only if he wants noticeably smarter handling.
3. **Prices** — real price list exists for ~5 products per earlier notes, but current code carries none and the standing rule is never invent rates. Either he confirms the real list with the T&A owner and we wire it in, or we keep the "fresh rate" deflection.

## What this unlocks

Once the dispatcher + history exist in the T&A demo, the same brain drops into the Roseto furniture demo and the guest-house booking demo with only a system-prompt swap — the flagship platform pattern, not three one-off bots.
