import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, _ctx: CommandContext) => {
  try {
    // Story elements
    const protagonists = [
      "a retired detective with a haunted past",
      "a young inventor who never sleeps",
      "a street musician with a mysterious map",
      "a chef searching for a legendary recipe",
      "a lighthouse keeper on a remote island",
      "a runaway heir to a fortune"
    ]

    const antagonists = [
      "a charming con artist",
      "a corrupt city official",
      "a rival with a personal grudge",
      "a shadowy organization",
      "an old friend turned enemy"
    ]

    const settings = [
      "a rain-soaked coastal city",
      "a quiet mountain village",
      "a bustling night market",
      "an abandoned amusement park",
      "a luxury train crossing the desert"
    ]

    const plots = [
      "a stranger handed them a locked briefcase",
      "they received a letter from someone long thought dead",
      "a priceless artifact went missing on their watch",
      "they overheard a conversation they were never meant to hear",
      "an old debt suddenly came due"
    ]

    const twists = [
      "the villain had been helping them all along",
      "it was all a misunderstanding blown out of proportion",
      "they had been chasing the wrong person entirely",
      "the real treasure was a truth nobody wanted to face"
    ]

    // Select random elements
    const protagonist = protagonists[Math.floor(Math.random() * protagonists.length)]
    const antagonist = antagonists[Math.floor(Math.random() * antagonists.length)]
    const setting = settings[Math.floor(Math.random() * settings.length)]
    const plot = plots[Math.floor(Math.random() * plots.length)]
    const twist = twists[Math.floor(Math.random() * twists.length)]

    // Construct story
    const story = `There lived ${protagonist}. Their quiet days in ${setting} were disrupted when ${plot}.\n\nDuring what followed, our hero crossed paths with ${antagonist}, who became a serious obstacle. After a series of close calls and clever escapes, when the end seemed in sight, the truth came out: ${twist}.\n\nNothing was quite as it had seemed — and the story was far from over.`

    // Format story message
    const storyText = `
*STORY*

${story}
`

    // Send story
    m.reply(storyText)


  } catch (error) {
    console.error('Error in story command:', error)
    m.reply('Something went wrong while writing that story.')
  }
}

export default {
  pattern: /^(story|tale)$/i,
  handler,
  help: 'Generate a random short story',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
