import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  try {
    const jokes = [
      "Why don't programmers like nature? Too many bugs.",
      "Why did the developer go broke? He used up all his cache.",
      "What do you call a fake noodle? An impasta.",
      "Why did the scarecrow win an award? He was outstanding in his field.",
      "What do you call cheese that isn't yours? Nacho cheese.",
      "Why don't skeletons fight each other? They don't have the guts.",
      "What did the ocean say to the beach? Nothing, it just waved.",
      "Why did the math book look sad? It had too many problems.",
      "What do you call a bear with no teeth? A gummy bear.",
      "Why did the bicycle fall over? It was two-tired.",
      "What did one wall say to the other? I'll meet you at the corner.",
      "Why did the cookie go to the doctor? It felt crumby.",
      "What do you call a fish without eyes? A fsh.",
      "Why did the student eat his homework? The teacher said it was a piece of cake.",
      "What's the best thing about Switzerland? The flag is a big plus."
    ]

    const joke = jokes[Math.floor(Math.random() * jokes.length)]

    m.reply(`*JOKE*\n\n${joke}`)

  } catch (error) {
    console.error('Error in joke command:', error)
    m.reply('Something went wrong while fetching a joke.')
  }
}

export default {
  pattern: /^(joke|funny|laugh)$/i,
  handler,
  help: 'Get a random joke',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
