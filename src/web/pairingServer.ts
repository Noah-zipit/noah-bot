import http from 'node:http'
import type { WASocket } from '@whiskeysockets/baileys'

export interface PairingServerOptions {
  /** Always returns the live socket (survives reconnects). */
  getSock: () => WASocket | null
  port: number
  /** Bind address — 127.0.0.1 for local use, 0.0.0.0 inside Docker/Railway. */
  host?: string
}

const READY_TIMEOUT_MS = 25000
const MAX_BODY_BYTES = 4096

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Noah Bot — Link WhatsApp</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: #0f1115; color: #e8eaed;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .card {
    width: 100%; max-width: 430px; background: #171a21;
    border: 1px solid #262b36; border-radius: 18px; padding: 32px 28px;
    box-shadow: 0 12px 40px rgba(0,0,0,.45);
  }
  h1 { font-size: 24px; letter-spacing: .5px; }
  h1 .dot { color: #25d366; }
  .sub { color: #9aa0ab; font-size: 14px; margin: 6px 0 18px; }
  .pill {
    display: inline-block; font-size: 12px; font-weight: 600;
    padding: 6px 14px; border-radius: 999px; margin-bottom: 22px;
    background: #2a2f3a; color: #9aa0ab;
  }
  .pill.ok { background: rgba(37,211,102,.14); color: #25d366; }
  label { display: block; font-size: 13px; color: #c6cbd4; margin-bottom: 8px; }
  label span { color: #7b818c; font-size: 12px; }
  input {
    width: 100%; padding: 14px; font-size: 17px; border-radius: 12px;
    border: 1px solid #2e3440; background: #10131a; color: #fff; outline: none;
  }
  input:focus { border-color: #25d366; }
  button {
    width: 100%; margin-top: 14px; padding: 14px; font-size: 16px; font-weight: 700;
    border: none; border-radius: 12px; background: #25d366; color: #062b16; cursor: pointer;
  }
  button:disabled { opacity: .5; cursor: default; }
  button.ghost { background: transparent; border: 1px solid #2e3440; color: #c6cbd4; font-weight: 600; }
  .err { color: #ff6b6b; font-size: 13px; margin-top: 10px; min-height: 18px; }
  .label { font-size: 13px; color: #9aa0ab; margin-bottom: 10px; }
  .code {
    font-family: ui-monospace, Menlo, monospace; font-size: 38px; font-weight: 700;
    letter-spacing: 6px; text-align: center; color: #25d366;
    background: #10131a; border: 1px dashed #2e3440; border-radius: 12px;
    padding: 18px 10px; margin-bottom: 20px;
  }
  .steps { margin: 0 0 16px 20px; font-size: 14px; color: #c6cbd4; line-height: 1.9; }
  .note { font-size: 12px; color: #7b818c; margin-bottom: 6px; }
  .big { font-size: 52px; text-align: center; color: #25d366; margin-bottom: 12px; }
  #doneWrap p { text-align: center; font-size: 15px; line-height: 1.7; color: #c6cbd4; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main class="card">
  <h1>Noah Bot<span class="dot">.</span></h1>
  <p class="sub">Link WhatsApp — no QR code needed</p>
  <div id="status" class="pill">Checking…</div>

  <div id="formWrap">
    <label for="phone">WhatsApp number <span>(with country code, no + or spaces)</span></label>
    <input id="phone" inputmode="numeric" autocomplete="tel" placeholder="e.g. 923001234567">
    <button id="go">Get pairing code</button>
    <p id="err" class="err"></p>
  </div>

  <div id="codeWrap" hidden>
    <p class="label">Enter this code on your phone:</p>
    <div id="code" class="code">········</div>
    <ol class="steps">
      <li>Open <b>WhatsApp</b> on your phone</li>
      <li>Go to <b>Settings</b> → <b>Linked devices</b></li>
      <li>Tap <b>Link a device</b>, then <b>&ldquo;Link with phone number instead&rdquo;</b></li>
      <li>Type in the code above</li>
    </ol>
    <p class="note">Codes expire after about a minute — type it quickly. Only the latest code works.</p>
    <button id="again" class="ghost">Get a new code</button>
  </div>

  <div id="doneWrap" hidden>
    <div class="big">✓</div>
    <p><b>WhatsApp is linked.</b><br>You can close this page — the bot is online.</p>
  </div>
</main>
<script>
(function () {
  var statusEl = document.getElementById('status');
  var formWrap = document.getElementById('formWrap');
  var codeWrap = document.getElementById('codeWrap');
  var doneWrap = document.getElementById('doneWrap');
  var phoneEl = document.getElementById('phone');
  var goEl = document.getElementById('go');
  var againEl = document.getElementById('again');
  var codeEl = document.getElementById('code');
  var errEl = document.getElementById('err');

  function showDone() {
    statusEl.textContent = 'Linked ✓';
    statusEl.className = 'pill ok';
    formWrap.hidden = true;
    codeWrap.hidden = true;
    doneWrap.hidden = false;
  }
  function showForm() {
    statusEl.textContent = 'Not linked';
    statusEl.className = 'pill';
    formWrap.hidden = false;
    doneWrap.hidden = true;
  }
  function checkStatus() {
    fetch('/api/status').then(function (r) { return r.json(); }).then(function (d) {
      if (d.registered) showDone();
      else if (doneWrap.hidden) showForm();
    }).catch(function () {});
  }
  function requestCode() {
    errEl.textContent = '';
    goEl.disabled = true;
    goEl.textContent = 'Getting code…';
    fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phoneEl.value })
    }).then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
    .then(function (res) {
      var d = res.d;
      if (d.ok) {
        var c = d.code || '';
        codeEl.textContent = c.slice(0, 4) + ' – ' + c.slice(4);
        formWrap.hidden = true;
        codeWrap.hidden = false;
      } else if (d.error === 'local-format') {
        errEl.textContent = 'Drop the leading 0 — start with the country code instead.';
      } else if (d.error === 'missing-country-code') {
        errEl.textContent = 'That looks like a local number — add the country code at the front.';
      } else if (d.error === 'invalid-number') {
        errEl.textContent = 'Enter a valid number with country code (digits only).';
      } else if (d.error === 'not-connected') {
        errEl.textContent = 'Bot is still connecting — wait a few seconds and try again.';
      } else if (d.error === 'already-linked') {
        showDone();
      } else {
        errEl.textContent = 'Could not get a code. Try again in a moment.';
      }
    }).catch(function () {
      errEl.textContent = 'Could not reach the bot. Is it running?';
    }).then(function () {
      goEl.disabled = false;
      goEl.textContent = 'Get pairing code';
    });
  }
  goEl.addEventListener('click', requestCode);
  againEl.addEventListener('click', requestCode);
  phoneEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') requestCode(); });
  checkStatus();
  setInterval(checkStatus, 3000);
})();
</script>
</body>
</html>`

/**
 * Tiny zero-dependency web server for linking WhatsApp via pairing code
 * (the "link with phone number" flow) instead of scanning a QR.
 *
 * - GET  /            → the linking page
 * - GET  /api/status  → { registered: boolean }
 * - POST /api/pair    → { ok: true, code } | { ok: false, error }
 *
 * Binds to 127.0.0.1 by default — pass host '0.0.0.0' when running
 * inside Docker/Railway so the platform can route to it.
 */
export function startPairingServer({ getSock, port, host = '127.0.0.1' }: PairingServerOptions): http.Server {
  const READY_POLL_MS = 500

  /** Mask a phone number for logs: keep first/last 2 digits only. */
  const maskNumber = (digits: string): string =>
    digits.length <= 4 ? '****' : `${digits.slice(0, 2)}****${digits.slice(-2)}`

  /**
   * Resolves true once the live socket has an open WebSocket.
   * Asks the CURRENT socket directly (sock.ws.isOpen) on every poll, so a
   * reconnect that replaces the socket can never leave us watching a dead one.
   */
  const waitForReady = async (): Promise<boolean> => {
    const start = Date.now()
    for (;;) {
      const sock = getSock()
      if (sock?.ws?.isOpen) return true
      if (Date.now() - start >= READY_TIMEOUT_MS) return false
      await new Promise((r) => setTimeout(r, READY_POLL_MS))
    }
  }

  const isRegistered = (): boolean => {
    const sock = getSock()
    return !!sock?.authState?.creds?.registered
  }

  const readBody = (req: http.IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new Error('body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

  const sendJson = (res: http.ServerResponse, status: number, data: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')

      // Allow the hosted pairing page (e.g. on Vercel) to call the API.
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }
      }

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(PAGE_HTML)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/status') {
        sendJson(res, 200, { registered: isRegistered() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/pair') {
        let body: { phoneNumber?: unknown }
        try {
          body = JSON.parse(await readBody(req)) as { phoneNumber?: unknown }
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }

        const digits = String(body.phoneNumber ?? '').replace(/\D/g, '')
        // A LID or a local-format number produces a real-looking code bound
        // to a number that is not the handset's — the phone then rejects it.
        if (digits.length < 8 || digits.length > 15) {
          sendJson(res, 400, { ok: false, error: 'invalid-number' })
          return
        }
        if (digits.startsWith('0')) {
          sendJson(res, 400, { ok: false, error: 'local-format' })
          return
        }
        if (digits.length < 11) {
          sendJson(res, 400, { ok: false, error: 'missing-country-code' })
          return
        }
        if (isRegistered()) {
          sendJson(res, 409, { ok: false, error: 'already-linked' })
          return
        }

        console.log(`Pairing code requested for ${maskNumber(digits)}`)
        const ready = await waitForReady()
        if (!ready) {
          console.log(`Pairing socket not ready for ${maskNumber(digits)}`)
          // Re-check: it may have linked while we waited.
          if (isRegistered()) sendJson(res, 409, { ok: false, error: 'already-linked' })
          else sendJson(res, 503, { ok: false, error: 'not-connected' })
          return
        }

        try {
          const sock = getSock()
          if (!sock || isRegistered()) {
            sendJson(res, 409, { ok: false, error: 'already-linked' })
            return
          }
          // requestPairingCode can hang indefinitely — cap it.
          const code = await Promise.race([
            sock.requestPairingCode(digits),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('pairing-code-timeout')), 15000)
            )
          ])
          console.log(`Pairing code issued for ${maskNumber(digits)}`)
          sendJson(res, 200, { ok: true, code })
        } catch (err) {
          console.error(`Pairing code request failed for ${maskNumber(digits)}:`, err)
          sendJson(res, 500, { ok: false, error: 'pair-failed' })
        }
        return
      }

      sendJson(res, 404, { ok: false, error: 'not-found' })
    } catch (err) {
      console.error('Pairing server error:', err)
      sendJson(res, 500, { ok: false, error: 'server-error' })
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    // The link page is a convenience for one-time pairing; a bind failure
    // (e.g. a stale process still holding the port during a watchdog
    // restart) must never take the whole bot down. Log and keep running.
    if (err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `Pairing server: port ${port} already in use — link page disabled, bot continues without it.`
      )
    } else {
      console.error('Pairing server error:', err)
    }
  })

  server.listen(port, host, () => {
    console.log(`Link page: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  })

  return server
}
