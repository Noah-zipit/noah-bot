import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { args, db }: CommandContext) => {
  try {
    // Need at least two people to ship
    if (m.mentionedJid.length < 2 && args.length < 2) {
      return m.reply('You must mention or name two users to calculate their compatibility!')
    }

    // Get the two people to ship
    let person1Name: string | undefined
    let person2Name: string | undefined

    if (m.mentionedJid.length >= 2) {
      // Two people are mentioned
      const person1 = m.mentionedJid[0]
      const person2 = m.mentionedJid[1]

      const user1 = await db.getUser(person1)
      const user2 = await db.getUser(person2)

      person1Name = user1.name
      person2Name = user2.name
    } else if (args.length >= 2) {
      // Names provided as arguments
      // Find the separator (and, &, +, etc.)
      let separator = -1
      for (let i = 0; i < args.length; i++) {
        if (['and', '&', '+', 'with', 'x'].includes(args[i].toLowerCase())) {
          separator = i
          break
        }
      }

      if (separator === -1) {
        // Split in the middle if no separator found
        separator = Math.floor(args.length / 2)
      }

      person1Name = args.slice(0, separator).join(' ')
      person2Name = args.slice(separator + 1).join(' ')
    } else {
      return m.reply('Please provide two names separated by "and", "&", or "+" OR mention two people!')
    }

    // Calculate compatibility (pseudo-random but consistent for same pairs)
    const nameHash = (person1Name + person2Name).toLowerCase().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const compatibility = nameHash % 101 // 0-100%

    // Determine the ship name (combine parts of both names)
    const shipName = person1Name.slice(0, Math.ceil(person1Name.length / 2)) +
                    person2Name.slice(Math.floor(person2Name.length / 2))

    // Get compatibility message based on score
    let message: string
    if (compatibility >= 90) {
      message = `These users' dao paths are intertwined by the threads of fate itself! Heavenly harmony exists between them.`
    } else if (compatibility >= 70) {
      message = `A powerful match! They'd make a great pair.`
    } else if (compatibility >= 50) {
      message = `A promising partnership. With time and effort, they could overcome many tribulations together.`
    } else if (compatibility >= 30) {
      message = `Their dao paths cross occasionally, but each walks their own way most of the time.`
    } else {
      message = `Not a great match — like fire and water.`
    }

    // Create compatibility meter
    const meterLength = 10
    const filledHearts = Math.round((compatibility / 100) * meterLength)
    const meter = '❤️'.repeat(filledHearts) + '🖤'.repeat(meterLength - filledHearts)

    // Format ship message
    const shipText = `
*SHIP*

*Users:* ${person1Name} & ${person2Name}
*Ship Name:* ${shipName}
*Compatibility:* ${compatibility}%

${meter}

*Heaven's Verdict:*
${message}

_"Even immortals seek compatible dao companions."_
`

    // Send ship result
    m.reply(shipText)


  } catch (error) {
    console.error('Error in ship command:', error)
    m.reply('Noah Bots divination abilities are being disrupted by chaotic energy. Try again later.')
  }
}

export default {
  pattern: /^(ship|compatibility|match)$/i,
  handler,
  help: 'Calculate compatibility between two users',
  usage: '!ship @user1 @user2',
  example: '!ship @John @Jane',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
