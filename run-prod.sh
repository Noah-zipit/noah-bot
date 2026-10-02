#!/bin/bash
# Lean production runner for one saad-bot instance.
# Usage: run-prod.sh [port] [session_dir] [data_dir]
# Defaults: port 3000, ./sessions, ./data (instance 1).
# Instance 2 example: ./run-prod.sh 3001 ./sessions2 ./data2
# Each instance gets its own session dir, data dir, and web port, so
# two WhatsApp numbers never share state.
set -u
cd "$(dirname "$0")"
PORT="${1:-3000}"
SESSION_DIR_ARG="${2:-./sessions}"
DATA_DIR_ARG="${3:-./data}"
if [ ! -f dist/index.js ]; then
  echo "dist/index.js missing - run 'npm run build' first" >&2
  exit 1
fi
mkdir -p "$SESSION_DIR_ARG" "$DATA_DIR_ARG"
export WEB_PORT="$PORT"
export SESSION_DIR="$(cd "$SESSION_DIR_ARG" && pwd)"
export DATA_DIR="$(cd "$DATA_DIR_ARG" && pwd)"
export NODE_OPTIONS="--max-old-space-size=384"
# Distinct process title so the watchdog can tell instances apart.
exec -a "saad-bot-$PORT" node dist/index.js
