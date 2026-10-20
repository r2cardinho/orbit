// Entry point: builds the screen and connects the API, the model and the graph.
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import { getFollowers, getFollowing, getProfile, onRateLimitChange, refreshRateLimit } from './api/github.ts'
import { GraphModel } from './graph/model.ts'
import { GraphView } from './graph/view.ts'
import { createRibbon } from './ui/ribbon.ts'
import { createStatusbar } from './ui/statusbar.ts'
import { strings } from './ui/strings.ts'
import { createTabs, MAP_PANEL_ID, MAP_TAB_ID } from './ui/tabs.ts'
import { createTopbar } from './ui/topbar.ts'

// ---------- Screen ----------

const app = document.querySelector<HTMLDivElement>('#app')!
app.className = 'app'

const topbar = createTopbar({ onSearch: (login) => startMap(login) })
const tabs = createTabs({ onClose: () => closeMap() })
const statusbar = createStatusbar({ onRateLimitReset: () => refreshRateLimit() })

const graphArea = document.createElement('div')
graphArea.className = 'graph-area'
graphArea.id = MAP_PANEL_ID
graphArea.setAttribute('role', 'tabpanel')
graphArea.setAttribute('aria-labelledby', MAP_TAB_ID)
graphArea.innerHTML = `
  <div class="graph" role="group" aria-label="${strings.graph.label}"></div>
  <p class="graph-empty">${strings.graph.empty}</p>
`
const graphElement = graphArea.querySelector<HTMLElement>('.graph')!
const emptyState = graphArea.querySelector<HTMLElement>('.graph-empty')!

const workspace = document.createElement('main')
workspace.className = 'workspace'
workspace.append(tabs.element, graphArea, statusbar.element)

app.append(topbar.element, createRibbon(), workspace)

// ---------- Map ----------

const model = new GraphModel()

// Created after the page is built, because Cytoscape needs its container to have a size.
const view = new GraphView(graphElement, model, {
  onPersonClick: (login) => {
    view.select(login)
    expand(login)
  },
  onBackgroundClick: () => view.select(null),
})

onRateLimitChange((rateLimit) => statusbar.setRateLimit(rateLimit))
refreshRateLimit()

/** Updates everything outside the graph that depends on the map. */
function render(): void {
  tabs.setTitle(model.getCenter())
  statusbar.setTotals({
    people: model.peopleCount,
    connections: model.linkCount,
    mutual: model.mutualCount,
  })
  emptyState.hidden = model.peopleCount > 0
}

// Each new map gets a new number. An answer from GitHub that arrives after the user
// started another map carries an old number and is ignored, so maps never mix.
let mapVersion = 0

// People whose followers and following are being fetched right now.
const expanding = new Set<string>()

/** Fetches who follows `login` and who `login` follows, and adds them to the map. */
async function expand(login: string): Promise<void> {
  if (model.isExpanded(login) || expanding.has(login)) return
  const version = mapVersion
  expanding.add(login)

  try {
    const [followers, following] = await Promise.all([getFollowers(login), getFollowing(login)])
    if (version !== mapVersion) return
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
    render()

    console.log(`${login} expanded. ${model.peopleCount - before} new people on the map.`)
  } catch (error) {
    if (version === mapVersion) console.error(error)
  } finally {
    expanding.delete(login)
  }
}

/** Starts a new map with `login` at the center. The old map stays if the user is not found. */
async function startMap(login: string): Promise<void> {
  const version = ++mapVersion

  try {
    const profile = await getProfile(login)
    if (version !== mapVersion) return

    model.clear()
    view.clear()
    expanding.clear()

    model.addPerson(profile)
    model.setCenter(profile.login)
    topbar.setQuery(profile.login) // the spelling GitHub uses, e.g. "torvalds" for "Torvalds"
    view.update({ fit: true })
    render()

    await expand(profile.login)
  } catch (error) {
    if (version === mapVersion) console.error(error)
  }
}

/** Closes the map and goes back to the empty state. */
function closeMap(): void {
  mapVersion++
  model.clear()
  view.clear()
  expanding.clear()
  topbar.setQuery('')
  render()
  topbar.focusSearch()
}

render()
topbar.focusSearch()
