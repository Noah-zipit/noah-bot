import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  try {
    // Array of classic riddles with answers
    const riddles = [
      {
        question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
        answer: "Echo"
      },
      {
        question: "The more of me you take, the more you leave behind. What am I?",
        answer: "Footsteps"
      },
      {
        question: "I have keys but no locks. I have space but no room. You can enter but never go inside. What am I?",
        answer: "Keyboard"
      },
      {
        question: "What has a head and a tail but no body?",
        answer: "Coin"
      },
      {
        question: "The more you take from me, the bigger I get. What am I?",
        answer: "Hole"
      },
      {
        question: "I am always hungry and must always be fed. The finger I touch soon turns red. What am I?",
        answer: "Fire"
      },
      {
        question: "What runs but never walks, has a mouth but never talks, has a bed but never sleeps?",
        answer: "River"
      },
      {
        question: "I have branches but no fruit, no trunk, and no leaves. What am I?",
        answer: "Bank"
      },
      {
        question: "What can you catch but never throw?",
        answer: "Cold"
      },
      {
        question: "I go up but never come down. What am I?",
        answer: "Age"
      }
    ]

    // Select a random riddle
    const riddle = riddles[Math.floor(Math.random() * riddles.length)]

    // Store the riddle in the user's data for checking the answer later
    await db.updateUser(m.sender, {
      'currentRiddle': {
        question: riddle.question,
        answer: riddle.answer,
        timestamp: Date.now()
      }
    })

    // Format riddle message
    const riddleText = `
*RIDDLE*

${riddle.question}

To answer, use !answer [your answer]
`

    // Send riddle
    m.reply(riddleText)


  } catch (error) {
    console.error('Error in riddle command:', error)
    m.reply('Something went wrong. The riddle could not be loaded.')
  }
}

export default {
  pattern: /^(riddle|puzzle|enigma)$/i,
  handler,
  help: 'Get a riddle to solve',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
