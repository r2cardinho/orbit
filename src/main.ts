// Entry point: builds the screen and connects the API, the model and the graph.
//
// The selected person lives here, in one place. Clicking someone on the map, in the
// people list or in the profile panel calls selectPerson, and render() then updates
// the list and the panel while the graph view highlights the same person.
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import {
  DEFAULT_PER_PAGE,
  GitHubError,
  getFollowers,
  getFollowing,
  getProfile,
  onRateLimitChange,
  refreshRateLimit,
  type GitHubProfile,
} from './api/github.ts'
import { GraphModel } from './graph/model.ts'
import { GraphView } from './graph/view.ts'
import { createPeopleList, type PersonEntry, type PersonGroup } from './ui/people-list.ts'
import { createProfilePanel, type Connection, type ProfileView, type Relation } from './ui/profile-panel.ts'
import { createRibbon } from './ui/ribbon.ts'
import { createStatusbar } from './ui/statusbar.ts'
import { strings } from './ui/strings.ts'
import { createTabs, MAP_PANEL_ID, MAP_TAB_ID } from './ui/tabs.ts'
import { createTopbar } from './ui/topbar.ts'

const PER_CLICK = DEFAULT_PER_PAGE // becomes a setting in "Map settings" later

// ---------- Screen ----------

const app = document.querySelector<HTMLDivElement>('#app')!
app.className = 'app'

const topbar = createTopbar({ onSearch: (login) => startMap(login) })
const ribbon = createRibbon({ onTogglePeople: () => setPeopleOpen(!peopleOpen) })
const peopleList = createPeopleList({ onSelect: (login) => selectPerson(login, true) })
const tabs = createTabs({ onClose: () => closeMap() })
const statusbar = createStatusbar({ onRateLimitReset: () => refreshRateLimit() })
const profilePanel = createProfilePanel({
  onSelect: (login) => selectPerson(login, true),
  onLoadMore: (login) => loadMore(login),
  onStartMap: (login) => startMap(login),
})

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

app.append(topbar.element, ribbon.element, peopleList.element, workspace, profilePanel.element)

let peopleOpen = true

function setPeopleOpen(open: boolean): void {
  peopleOpen = open
  peopleList.element.hidden = !open
  app.classList.toggle('is-people-closed', !open)
  ribbon.setPeopleOpen(open)
}

// ---------- Map state ----------

const model = new GraphModel()

// Created after the page is built, because Cytoscape needs its container to have a size.
const view = new GraphView(graphElement, model, {
  onPersonClick: (login) => selectPerson(login, false),
  onBackgroundClick: () => selectPerson(null, false),
})

onRateLimitChange((rateLimit) => statusbar.setRateLimit(rateLimit))
refreshRateLimit()

/** How far each person's followers and following were loaded ("Load 20 more"). */
interface Paging {
  nextPage: number
  followersDone: boolean
  followingDone: boolean
}

interface ProfileState {
  profile: GitHubProfile | null
  error: string | null
}

// Each new map gets a new number. An answer from GitHub that arrives after the user
// started another map carries an old number and is ignored, so maps never mix.
let mapVersion = 0
let selected: string | null = null
const paging = new Map<string, Paging>()
const loading = new Set<string>() // people whose connections are being fetched right now
const profiles = new Map<string, ProfileState>()

// GitHub logins ignore case, so every map above is keyed by the lowercase login.
function key(login: string): string {
  return login.toLowerCase()
}

function errorMessage(error: unknown): string {
  return error instanceof GitHubError ? error.message : strings.errors.unexpected(0)
}

// ---------- Selection ----------

/** Selects someone (or nobody) everywhere at once: map, list and profile. */
function selectPerson(login: string | null, reveal: boolean): void {
  selected = login === null ? null : (model.getPerson(login)?.login ?? login)
  view.select(selected)
  if (selected !== null && reveal) view.reveal(selected)
  render()

  if (selected !== null) {
    loadProfile(selected)
    if (!model.isExpanded(selected)) loadMore(selected)
  }
}

// ---------- Loading from GitHub ----------

/** Fetches the next page of followers and following of `login` and adds them to the map. */
async function loadMore(login: string): Promise<void> {
  const page = paging.get(key(login)) ?? { nextPage: 1, followersDone: false, followingDone: false }
  if (loading.has(key(login)) || (page.followersDone && page.followingDone)) return

  const version = mapVersion
  loading.add(key(login))
  render()

  try {
    const [followers, following] = await Promise.all([
      page.followersDone ? null : getFollowers(login, page.nextPage, PER_CLICK),
      page.followingDone ? null : getFollowing(login, page.nextPage, PER_CLICK),
    ])
    if (version !== mapVersion) return
    const before = model.peopleCount

    for (const user of followers?.users ?? []) {
      model.addPerson(user)
      model.addFollow(user.login, login)
    }
    for (const user of following?.users ?? []) {
      model.addPerson(user)
      model.addFollow(login, user.login)
    }
    paging.set(key(login), {
      nextPage: page.nextPage + 1,
      followersDone: followers === null || !followers.hasNextPage,
      followingDone: following === null || !following.hasNextPage,
    })
    model.markExpanded(login)
    view.update({ origin: login, fit: model.isCenter(login) && page.nextPage === 1 })

    console.log(`${login} expanded. ${model.peopleCount - before} new people on the map.`)
  } catch (error) {
    if (version === mapVersion) console.error(error)
  } finally {
    if (version === mapVersion) {
      loading.delete(key(login))
      render()
    }
  }
}

/** Fetches the full profile (name, bio, numbers) for the profile panel. */
async function loadProfile(login: string): Promise<void> {
  if (profiles.has(key(login))) return
  const version = mapVersion
  profiles.set(key(login), { profile: null, error: null })

  try {
    const profile = await getProfile(login)
    profiles.set(key(login), { profile, error: null })
  } catch (error) {
    profiles.set(key(login), { profile: null, error: errorMessage(error) })
  }
  if (version === mapVersion) render()
}

// ---------- Maps ----------

function resetMap(): void {
  model.clear()
  view.clear()
  paging.clear()
  loading.clear()
  profiles.clear()
  selected = null
}

/** Starts a new map with `login` at the center. The old map stays if the user is not found. */
async function startMap(login: string): Promise<void> {
  const version = ++mapVersion

  try {
    const profile = await getProfile(login)
    if (version !== mapVersion) return

    resetMap()
    model.addPerson(profile)
    model.setCenter(profile.login)
    profiles.set(key(profile.login), { profile, error: null })
    topbar.setQuery(profile.login) // the spelling GitHub uses, e.g. "torvalds" for "Torvalds"
    view.update({ fit: true })

    // The center starts selected, so the profile panel shows who the map is about.
    selectPerson(profile.login, false)
  } catch (error) {
    if (version === mapVersion) console.error(error)
  }
}

/** Closes the map and goes back to the empty state. */
function closeMap(): void {
  mapVersion++
  resetMap()
  topbar.setQuery('')
  render()
  topbar.focusSearch()
}

// ---------- Drawing everything outside the graph ----------

function groupOf(login: string): PersonGroup {
  if (model.isCenter(login)) return 'center'
  return model.isExpanded(login) ? 'expanded' : 'idle'
}

/** People linked to both the selected person and the center (for the highlighter). */
function commonWithCenter(): Set<string> {
  const center = model.getCenter()
  if (selected === null || center === null || model.isCenter(selected)) return new Set()
  return new Set(model.getCommonConnections(selected, center).map(key))
}

// Mutual first, then who they follow, then who follows them; names in alphabetical order.
const RELATION_ORDER: Relation[] = ['mutual', 'follows', 'followed-by']

function profileViewOf(login: string, common: Set<string>): ProfileView {
  const person = model.getPerson(login)!
  const state = profiles.get(key(login)) ?? { profile: null, error: null }
  const following = new Set(model.getFollowing(login).map(key))
  const followers = new Set(model.getFollowers(login).map(key))
  const page = paging.get(key(login))

  const connections: Connection[] = model.getNeighbors(login).map((other) => {
    const k = key(other)
    const relation: Relation =
      following.has(k) && followers.has(k) ? 'mutual' : following.has(k) ? 'follows' : 'followed-by'
    return { login: other, group: groupOf(other), relation, common: common.has(k) }
  })
  connections.sort(
    (a, b) =>
      RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation) ||
      a.login.localeCompare(b.login, 'en', { sensitivity: 'base' }),
  )

  return {
    login: person.login,
    avatarUrl: state.profile?.avatarUrl ?? person.avatarUrl,
    profile: state.profile,
    profileError: state.error,
    isCenter: model.isCenter(login),
    center: model.getCenter(),
    loadMore: loading.has(key(login))
      ? 'loading'
      : page !== undefined && page.followersDone && page.followingDone
        ? 'done'
        : 'ready',
    perClick: PER_CLICK,
    counts: { follows: following.size, followedBy: followers.size, mutual: model.getMutuals(login).length },
    common: connections.filter((connection) => connection.common).map((connection) => connection.login),
    connections,
  }
}

/** Updates everything outside the graph that depends on the map or the selection. */
function render(): void {
  tabs.setTitle(model.getCenter())
  statusbar.setTotals({
    people: model.peopleCount,
    connections: model.linkCount,
    mutual: model.mutualCount,
  })
  emptyState.hidden = model.peopleCount > 0

  const common = commonWithCenter()
  const entries: PersonEntry[] = model.getPeople().map((person) => ({
    login: person.login,
    group: groupOf(person.login),
    common: common.has(key(person.login)),
  }))
  peopleList.update(entries, selected)
  profilePanel.show(selected === null || !model.hasPerson(selected) ? null : profileViewOf(selected, common))
}

setPeopleOpen(true)
render()
topbar.focusSearch()
