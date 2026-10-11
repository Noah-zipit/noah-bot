// Smoke test for the ShopAgent engine. Run: npx tsx scripts/smoke-shopagent.ts
import { loadBusiness, buildSystemPrompt, brainAnswer } from '../src/lib/shopBrain.js'
import { presetBrain, handleCartText, type ChatState } from '../src/lib/shopAgent.js'

delete process.env.ANTHROPIC_API_KEY
delete process.env.NVIDIA_NIM_API_KEY

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`) }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function freshState(): ChatState {
  return {
    greeted: false, askedQualifier: false, askedCity: false, ended: false,
    cart: [], history: [], nudgeSent: false, lastActive: Date.now(),
    fallbackStreak: 0, awaitingLead: false, leadSaved: false,
    awaitingSlot: false, checkoutPending: false, urduScript: false,
  }
}

// --- 1. system prompt grounded in config
const ta = loadBusiness('ta-electronics')!
check('ta config loads', !!ta && ta.id === 'ta-electronics')
const prompt = buildSystemPrompt(ta)
check('prompt has address', prompt.includes('25-G Gohar Centre'))
check('prompt has sizes', prompt.includes('19, 22, 24, 32'))
check('prompt forbids invention', /never invent/i.test(prompt))
check('prompt has price policy', prompt.includes('Never invent a rupee amount'))

const em = loadBusiness('elevate-mavens')!
check('agency config loads', !!em && em.name === 'Elevate Mavens')
const emPrompt = buildSystemPrompt(em)
check('agency prompt has pricing', emPrompt.includes('15,000'))
check('agency prompt has services', emPrompt.includes('WhatsApp AI agents'))

// --- 3. cart flow
const st3 = freshState()
const add = handleCartText(ta, st3, 'add 32 inch')!
check('cart add finds item', !!add && /32 inch LED/.test(add.reply) && st3.cart.length === 1, add?.reply.slice(0, 60))
const cart = handleCartText(ta, st3, 'cart')!
check('cart lists items', /32 inch LED/.test(cart.reply))
const co = handleCartText(ta, st3, 'checkout')!
check('checkout places order', !!co.orderPlaced && co.orderPlaced.items.length === 1 && /Payment/.test(co.reply))
const bad = handleCartText(ta, st3, 'add spaceship')!
check('cart rejects unknown item', /nahi mila/.test(bad.reply))

// --- 4. brain returns null with no providers (preset fallback path)
const noBrain = await brainAnswer(ta, [], 'hello')
check('brain null without keys', noBrain === null)

// --- 5. agency preset brain: no repeated qualifier question after greeting asked it
const st4 = freshState()
const g = presetBrain(em, 'hello', st4)
check('agency greeting', g.reply.includes("Elevate Mavens' own assistant"))
const q = presetBrain(em, 'price?', st4)
check('agency price does not repeat qualifier question', !/kya banayein/.test(q.reply), `got: ${q.reply.slice(0, 60)}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
