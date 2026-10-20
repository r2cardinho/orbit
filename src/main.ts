// Entry point: builds the screen and connects the API, the model and the graph.
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import { getFollowers, getFollowing, getProfile } from './api/github.ts'
import { GraphModel } from './graph/model.ts'
import { GraphView } from './graph/view.ts'

// Temporary: the map always starts from this user until the search box exists.
const START_USER = 'r2cardinho'

const model = new GraphModel()

const graphElement = document.createElement('div')
graphElement.className = 'graph'
document.querySelector<HTMLDivElement>('#app')!.append(graphElement)

const view = new GraphView(graphElement, model, {
  onPersonClick: (login) => {
    view.select(login)
    expand(login)
  },
  onBackgroundClick: () => view.select(null),
})

// People whose followers and following are being fetched right now.
const expanding = new Set<string>()

/** Fetches who follows `login` and who `login` follows, and adds them to the map. */
async function expand(login: string): Promise<void> {
  if (model.isExpanded(login) || expanding.has(login)) return
  expanding.add(login)

  try {
    const [followers, following] = await Promise.all([getFollowers(login), getFollowing(login)])
    const before = model.peopleCount

    for (const user of followers.users) {
      model.addPerson(user)
      model.addFollow(user.login, login)
    }
    for (const user of following.users) {
      model.addPerson(user)
      model.addFollow(login, user.login)
    }
    model.markExpanded(login)
    view.update({ origin: login, fit: model.isCenter(login) })

    console.log(`${login} expanded. ${model.peopleCount - before} new people on the map.`)
  } catch (error) {
    console.error(error)
  } finally {
    expanding.delete(login)
  }
}

async function startMap(login: string): Promise<void> {
  try {
    const profile = await getProfile(login)
    model.addPerson(profile)
    model.setCenter(profile.login)
    view.update({ fit: true })
    await expand(profile.login)
  } catch (error) {
    console.error(error)
  }
}

startMap(START_USER)
