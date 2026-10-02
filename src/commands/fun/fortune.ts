import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  try {
    // Get user data
    const user = await db.getUser(m.sender)

    // Fortune messages
    const fortunes = [
      "A great opportunity is coming your way this month. Keep your eyes open.",
      "Someone close to you has good news to share. Listen carefully.",
      "Your hard work is about to pay off. Stay consistent.",
      "A surprise awaits you in the coming days. Expect the unexpected.",
      "Good things come to those who wait, but better things come to those who act.",
      "Your luck is on the rise. Now is a good time to take a chance.",
      "A new connection will bring positive change into your life.",
      "Trust your instincts today. They will not lead you wrong.",
      "Financial improvement is on the horizon. Be smart with your choices.",
      "Someone admires your efforts from afar. Keep going."
    ]

    // Advice messages
    const advice = [
      "Patience is a virtue. Good things take time.",
      "Take a break when you need one. Rest is productive too.",
      "Be kind to others. It always comes back around.",
      "Focus on what you can control and let go of the rest.",
      "Small steps every day lead to big results.",
      "Don't be afraid to ask for help when you need it.",
      "Stay true to yourself, even when it's difficult.",
      "Learn from yesterday, live for today, plan for tomorrow."
    ]

    // Select random fortune and advice
    const userFortune = fortunes[Math.floor(Math.random() * fortunes.length)]
    const userAdvice = advice[Math.floor(Math.random() * advice.length)]

    // Generate lucky number and color
    const luckyNumber = Math.floor(Math.random() * 99) + 1
    const luckyColors = ['Red', 'Blue', 'Green', 'Gold', 'Purple', 'White', 'Black']
    const luckyColor = luckyColors[Math.floor(Math.random() * luckyColors.length)]

    // Create fortune text
    const fortuneText = `*FORTUNE*\n\n*Your Fortune:*\n${userFortune}\n\n*Advice:*\n${userAdvice}\n\n*Lucky Number:* ${luckyNumber}\n*Lucky Color:* ${luckyColor}`

    // Send fortune
    m.reply(fortuneText)

  } catch (error) {
    console.error('Error in fortune command:', error)
    m.reply('Something went wrong while reading your fortune.')
  }
}

export default {
  pattern: /^(fortune|divination|luck)$/i,
  handler,
  help: 'Get your fortune',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
