// Entry point: builds the screen and connects the API, the model and the graph.
//
// The selected person lives here, in one place. Clicking someone on the map, in the
// people list or in the profile panel calls selectPerson, and render() then updates
// the list and the panel while the graph view highlights the same person.
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import {
  GitHubError,
  addToken,
  getFollowers,
  getFollowing,
  getProfile,
  hasToken,
  onRateLimitChange,
  refreshRateLimit,
  removeToken,
  type GitHubProfile,
} from './api/github.ts'
import { GraphModel } from './graph/model.ts'
import { GraphView } from './graph/view.ts'
import { createInfobar, type Notice } from './ui/infobar.ts'
import { createMapControls } from './ui/map-controls.ts'
import { createPeopleList, type PersonEntry, type PersonGroup } from './ui/people-list.ts'
import { createProfilePanel, type Connection, type ProfileView, type Relation } from './ui/profile-panel.ts'
import { createRibbon } from './ui/ribbon.ts'
import { createSettingsPanel, DEFAULT_SETTINGS, type MapSettings } from './ui/settings-panel.ts'
import { createStatusbar } from './ui/statusbar.ts'
import { strings } from './ui/strings.ts'
import { createTabs, MAP_PANEL_ID, MAP_TAB_ID } from './ui/tabs.ts'
import { createTokenDialog } from './ui/token-dialog.ts'
import { createTopbar } from './ui/topbar.ts'

let settings: MapSettings = { ...DEFAULT_SETTINGS }

// ---------- Screen ----------

const app = document.querySelector<HTMLDivElement>('#app')!
app.className = 'app'

const topbar = createTopbar({
  onSearch: (login) => startMap(login),
  onAddToken: () => tokenDialog.open(hasToken()),
})
const ribbon = createRibbon({
  onTogglePeople: () => setPeopleOpen(!peopleOpen),
  onToggleSettings: () => setSettingsOpen(!settingsOpen),
})
const peopleList = createPeopleList({ onSelect: (login) => selectPerson(login, true) })
const tabs = createTabs({ onClose: () => closeMap() })
const statusbar = createStatusbar({ onRateLimitReset: () => refreshRateLimit() })
const profilePanel = createProfilePanel({
  onSelect: (login) => selectPerson(login, true),
  onLoadMore: (login) => loadMore(login),
  onStartMap: (login) => startMap(login),
})
const infobar = createInfobar()
const settingsPanel = createSettingsPanel({
  onChange: (next) => applySettings(next),
  onClose: () => setSettingsOpen(false),
})
const mapControls = createMapControls({
  onZoomIn: () => view.zoomIn(),
  onZoomOut: () => view.zoomOut(),
  onFit: () => view.fit(),
})
const tokenDialog = createTokenDialog({ onSave: (token) => saveToken(token), onRemove: () => dropToken() })

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
// Panels floating over the map: notice (top left), settings (top right),
// legend (bottom left) and zoom (bottom right).
graphArea.append(infobar.element, settingsPanel.element, mapControls.legend, mapControls.zoom)

const workspace = document.createElement('main')
workspace.className = 'workspace'
workspace.append(tabs.element, graphArea, statusbar.element)

app.append(topbar.element, ribbon.element, peopleList.element, workspace, profilePanel.element)
document.body.append(tokenDialog.element)

let peopleOpen = true
let settingsOpen = true // "Map settings" starts open, as in the approved design

function setPeopleOpen(open: boolean): void {
  peopleOpen = open
  peopleList.element.hidden = !open
  app.classList.toggle('is-people-closed', !open)
  ribbon.setPeopleOpen(open)
}

function setSettingsOpen(open: boolean): void {
  settingsOpen = open
  settingsPanel.setOpen(open)
  ribbon.setSettingsOpen(open)
}

// ---------- Map state ----------

const model = new GraphModel()

// Created after the page is built, because Cytoscape needs its container to have a size.
const view = new GraphView(graphElement, model, {
  onPersonClick: (login) => selectPerson(login, false),
  onBackgroundClick: () => selectPerson(null, false),
  onZoom: (percent) => mapControls.setZoom(percent),
})

onRateLimitChange((rateLimit) => statusbar.setRateLimit(rateLimit))
refreshRateLimit()

/** How much of each person's followers and following was loaded ("Load 20 more"). */
interface Paging {
  followersLoaded: number
  followingLoaded: number
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

/** Error notice; when the limit is reached without a token, it offers "Add token". */
function errorNotice(error: unknown, title?: string): Notice {
  const notice: Notice = { kind: 'error', title, detail: errorMessage(error) }
  if (error instanceof GitHubError && error.kind === 'rate-limit' && !hasToken()) {
    notice.action = { label: strings.topbar.addToken, onClick: () => tokenDialog.open(false) }
  }
  return notice
}

// ---------- Settings ----------

function applySettings(next: MapSettings): void {
  if (next.spacing !== settings.spacing) view.setSpacing(next.spacing / 100)
  settings = next
  view.setDisplay({
    mutualOnly: settings.mutualOnly,
    showNotExpanded: settings.showNotExpanded,
    nodeScale: settings.nodeSize / 100,
  })
  render() // "Load 20 more" follows "Per click"
}

// ---------- Token ----------

async function saveToken(token: string): Promise<string | null> {
  try {
    await addToken(token)
  } catch (error) {
    return errorMessage(error)
  }
  topbar.setHasToken(true)
  infobar.show({ kind: 'success', title: strings.notices.tokenAdded, detail: strings.notices.tokenAddedDetail })
  return null
}

async function dropToken(): Promise<void> {
  await removeToken()
  topbar.setHasToken(false)
  infobar.show({ kind: 'success', title: strings.notices.tokenRemoved, detail: strings.notices.tokenRemovedDetail })
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

/**
 * Fetches the next followers and following of `login` ("Per click" of each list)
 * and adds them to the map.
 *
 * The page asked for is worked out from how many were already loaded, so changing
 * "Per click" in the middle never skips anyone. At worst a page repeats a few people,
 * and the model ignores repeats.
 */
async function loadMore(login: string): Promise<void> {
  const page = paging.get(key(login)) ?? {
    followersLoaded: 0,
    followingLoaded: 0,
    followersDone: false,
    followingDone: false,
  }
  if (loading.has(key(login)) || (page.followersDone && page.followingDone)) return

  const version = mapVersion
  const perClick = settings.perClick
  const pageAfter = (loaded: number) => Math.floor(loaded / perClick) + 1
  loading.add(key(login))
  infobar.show({ kind: 'loading', detail: strings.notices.loadingConnections(login) })
  render()

  try {
    const followersPage = pageAfter(page.followersLoaded)
    const followingPage = pageAfter(page.followingLoaded)
    const [followers, following] = await Promise.all([
      page.followersDone ? null : getFollowers(login, followersPage, perClick),
      page.followingDone ? null : getFollowing(login, followingPage, perClick),
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
      followersLoaded: followers === null ? page.followersLoaded : (followersPage - 1) * perClick + followers.users.length,
      followingLoaded: following === null ? page.followingLoaded : (followingPage - 1) * perClick + following.users.length,
      followersDone: followers === null || !followers.hasNextPage,
      followingDone: following === null || !following.hasNextPage,
    })
    const firstTime = !model.isExpanded(login)
    model.markExpanded(login)
    view.update({ origin: login, fit: model.isCenter(login) && firstTime })

    infobar.show({
      kind: 'success',
      title: strings.notices.expanded(login),
      detail: strings.notices.newPeople(model.peopleCount - before),
    })
  } catch (error) {
    if (version === mapVersion) infobar.show(errorNotice(error, strings.notices.couldNotLoad(login)))
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
  infobar.show({ kind: 'loading', detail: strings.notices.loadingMap(login) })

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
    if (version === mapVersion) infobar.show(errorNotice(error))
  }
}

/** Closes the map and goes back to the empty state. */
function closeMap(): void {
  mapVersion++
  resetMap()
  infobar.hide()
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
    perClick: settings.perClick,
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
setSettingsOpen(true)
render()
topbar.focusSearch()
