import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { args, db }: CommandContext) => {
  try {
    if (args.length === 0) {
      return m.reply('You must provide an answer to the riddle!')
    }

    // Get user data
    const user = await db.getUser(m.sender)

    // Check if user has an active riddle
    if (!user.currentRiddle) {
      return m.reply('You have no active riddle to answer! Use !riddle to get a new one.')
    }

    // Check if riddle is expired (30 minutes)
    const riddleAge = Date.now() - user.currentRiddle.timestamp
    if (riddleAge > 30 * 60 * 1000) {
      await db.updateUser(m.sender, { currentRiddle: null })
      return m.reply('Your riddle has expired! Use !riddle to get a new one.')
    }

    // Get user's answer
    const userAnswer = args.join(' ').toLowerCase()

    // Check answer
    const correctAnswer = user.currentRiddle.answer.toLowerCase()
    const isCorrect = userAnswer.includes(correctAnswer) || correctAnswer.includes(userAnswer)

    if (isCorrect) {
      // Clear the current riddle
      await db.updateUser(m.sender, { currentRiddle: null })

      return m.reply(`*Correct Answer!*\n\nThe answer is: *${user.currentRiddle.answer}*`)
    } else {
      // Wrong answer
      return m.reply(`*Incorrect!*\n\nTry again:\n\n"${user.currentRiddle.question}"`)
    }

  } catch (error) {
    console.error('Error in answer command:', error)
    m.reply('Something went wrong while checking your answer.')
  }
}

export default {
  pattern: /^(answer|solve|solution)$/i,
  handler,
  help: 'Answer a riddle from the !riddle command',
  usage: '!answer [your answer]',
  example: '!answer meditation',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
