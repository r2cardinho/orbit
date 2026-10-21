// Profile of the selected person: photo, name, GitHub link, bio, profile numbers,
// actions, counts on this map, people in common with the center and connections.
//
// The panel only draws what it receives in a ProfileView; main.ts builds that view
// from the model and the API, so this file never fetches anything by itself.
//
// On phones the panel is a drawer at the bottom of the screen. Its handle opens it
// higher (bio, numbers, all connections) or lowers it again; CSS decides what shows.

import type { GitHubProfile } from '../api/github.ts'
import { icons } from './icons.ts'
import type { PersonGroup } from './people-list.ts'
import { strings } from './strings.ts'

export type Relation = 'mutual' | 'follows' | 'followed-by'

export interface Connection {
  login: string
  group: PersonGroup
  relation: Relation
  common: boolean
}

export interface ProfileView {
  login: string
  avatarUrl: string | null
  /** `null` while loading or when loading failed. */
  profile: GitHubProfile | null
  profileError: string | null
  isCenter: boolean
  center: string | null
  loadMore: 'ready' | 'loading' | 'done'
  perClick: number
  counts: { follows: number; followedBy: number; mutual: number }
  common: string[]
  connections: Connection[]
}

export interface ProfilePanelHandlers {
  onSelect(login: string): void
  onLoadMore(login: string): void
  onStartMap(login: string): void
}

export interface ProfilePanel {
  element: HTMLElement
  /** Draws a person's profile, or the empty state with `null`. */
  show(view: ProfileView | null): void
}

/** "Carolina Teixeira" -> "CT", "carol-ti" -> "CA" */
function initialsOf(name: string | null, login: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter((word) => word !== '')
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return (words[0] ?? login).slice(0, 2).toUpperCase()
}

/** Small helper to create an element with a class and optional text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  if (content !== undefined) element.textContent = content
  return element
}

export function createProfilePanel(handlers: ProfilePanelHandlers): ProfilePanel {
  const text = strings.profile
  const element = document.createElement('aside')
  element.className = 'profile-panel'
  element.setAttribute('aria-label', text.label)

  // Drawer state on phones: lowered (false) or raised (true). A new person starts lowered.
  let expanded = false
  let shownLogin: string | null = null

  function show(view: ProfileView | null): void {
    // Redrawing replaces the buttons, so the one with keyboard focus is found again by its key.
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset.focusKey
    element.replaceChildren()

    if (view?.login !== shownLogin) expanded = false
    shownLogin = view?.login ?? null
    element.classList.toggle('is-expanded', expanded)
    element.classList.toggle('is-empty', view === null)

    if (view === null) element.append(el('p', 'profile-empty', text.empty))
    else {
      element.append(
        // Computer order; on phones CSS moves the counts sentence and "In common" above the buttons.
        handle(view),
        header(view),
        ...details(view),
        actions(view),
        counts(view),
        countsSentence(view),
        ...inCommon(view),
        connections(view),
      )
    }

    if (focusKey !== undefined) {
      element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus()
    }
  }

  // ---------- Sections ----------

  /** Phones only: the bar on top of the drawer, which raises or lowers it. */
  function handle(view: ProfileView): HTMLElement {
    const button = el('button', 'sheet-handle phone-only')
    button.type = 'button'
    button.dataset.focusKey = 'sheet-handle'
    button.setAttribute('aria-expanded', String(expanded))
    button.setAttribute('aria-label', expanded ? text.collapse : text.expand)
    button.append(el('span', 'sheet-handle-bar'))
    button.addEventListener('click', () => {
      expanded = !expanded
      show(view)
    })
    return button
  }

  /** Phones only: "On this map: follows 5, followed by 5, 3 mutual." */
  function countsSentence(view: ProfileView): HTMLElement {
    const sentence = el('p', 'profile-counts-sentence phone-only', text.onThisMap)
    sentence.append(
      text.followsCount(view.counts.follows),
      strings.list.separator,
      text.followedByCount(view.counts.followedBy),
      strings.list.separator,
      el('strong', 'is-accent', text.mutualCount(view.counts.mutual)),
      '.',
    )
    return sentence
  }

  function header(view: ProfileView): HTMLElement {
    const section = el('header', 'profile-header')

    // Initials stay behind the photo: they show while it loads or if it fails.
    const avatar = el('div', 'avatar', initialsOf(view.profile?.name ?? null, view.login))
    avatar.setAttribute('aria-hidden', 'true')
    if (view.avatarUrl !== null) {
      const photo = el('img', 'avatar-photo')
      photo.src = view.avatarUrl
      photo.alt = ''
      photo.addEventListener('error', () => photo.remove())
      avatar.append(photo)
    }

    const names = el('div', 'profile-names')
    const name = el('h2', 'profile-name', view.profile?.name ?? view.login) // as written on GitHub
    const link = el('a', 'profile-link', text.onGitHub(view.login))
    link.href = view.profile?.htmlUrl ?? `https://github.com/${encodeURIComponent(view.login)}`
    link.target = '_blank'
    link.rel = 'noopener'
    names.append(name, link)

    section.append(avatar, names)
    return section
  }

  function details(view: ProfileView): HTMLElement[] {
    if (view.profileError !== null) return [el('p', 'profile-error', view.profileError)]
    if (view.profile === null) return [el('p', 'profile-stats', text.loadingProfile)]

    const parts: HTMLElement[] = []
    if (view.profile.bio !== null && view.profile.bio.trim() !== '') {
      parts.push(el('p', 'profile-bio', view.profile.bio))
    }
    parts.push(
      el('p', 'profile-stats', text.stats(view.profile.followers, view.profile.following, view.profile.publicRepos)),
    )
    return parts
  }

  function actions(view: ProfileView): HTMLElement {
    const section = el('div', 'profile-actions')

    const label = { ready: text.loadMore(view.perClick), loading: text.loading, done: text.allLoaded }[view.loadMore]
    const loadMore = el('button', 'button button--accent', label)
    loadMore.type = 'button'
    loadMore.dataset.focusKey = 'load-more'
    // aria-disabled instead of disabled: a disabled button loses keyboard focus while loading.
    if (view.loadMore !== 'ready') loadMore.setAttribute('aria-disabled', 'true')
    loadMore.addEventListener('click', () => {
      if (view.loadMore === 'ready') handlers.onLoadMore(view.login)
    })

    // The long label shows on computers, the short one on phones (only one is ever visible).
    const startMap = el('button', 'button')
    startMap.append(el('span', 'label-long', text.startMap), el('span', 'label-short', text.startMapShort))
    startMap.type = 'button'
    startMap.dataset.focusKey = 'start-map'
    startMap.disabled = view.isCenter
    startMap.addEventListener('click', () => handlers.onStartMap(view.login))

    section.append(loadMore, startMap)
    return section
  }

  function counts(view: ProfileView): HTMLElement {
    const list = el('dl', 'card profile-counts')
    const rows: [string, number, string][] = [
      [text.followsOnMap, view.counts.follows, ''],
      [text.followedBy, view.counts.followedBy, ''],
      [text.mutual, view.counts.mutual, 'is-accent'],
    ]
    for (const [label, value, extraClass] of rows) {
      const row = el('div', 'card-row')
      row.append(el('dt', '', label), el('dd', extraClass, String(value)))
      list.append(row)
    }
    return list
  }

  function inCommon(view: ProfileView): HTMLElement[] {
    if (view.isCenter || view.center === null) return []
    if (view.common.length === 0) return [el('p', 'profile-common', text.nothingInCommon(view.center))]

    // "In common with rigui: gabs0 and jv-santos", each name a button to select that person.
    const paragraph = el('p', 'profile-common', text.inCommonWith(view.center))
    view.common.forEach((login, index) => {
      paragraph.append(personButton(login, 'marker-button marker'))
      const remaining = view.common.length - index - 1
      if (remaining > 1) paragraph.append(strings.list.separator)
      if (remaining === 1) paragraph.append(strings.list.lastSeparator)
    })
    return [paragraph]
  }

  function connections(view: ProfileView): HTMLElement {
    const section = el('section', 'profile-connections')
    section.append(el('h3', 'profile-section-title', text.connections(view.connections.length)))

    if (view.connections.length === 0) {
      section.append(el('p', 'profile-stats', text.noConnections))
      return section
    }

    const list = el('ul', 'connection-rows')
    for (const connection of view.connections) {
      const item = el('li', '')
      const row = personButton(connection.login, `connection-row person-row--${connection.group}`)
      row.prepend(el('span', 'person-dot'))
      const name = row.querySelector('.person-label')!
      if (connection.common) name.classList.add('marker')
      row.append(relationLabel(connection.relation, view.login))
      item.append(row)
      list.append(item)
    }
    section.append(list)
    return section
  }

  function relationLabel(relation: Relation, selected: string): HTMLElement {
    if (relation === 'mutual') {
      const label = el('span', 'connection-relation is-mutual')
      label.innerHTML = icons.mutual
      label.append(text.relationMutual)
      return label
    }
    const content = relation === 'follows' ? text.relationFollows(selected) : text.relationFollowedBy(selected)
    return el('span', 'connection-relation', content)
  }

  /** A button showing a login; clicking it selects that person. */
  function personButton(login: string, className: string): HTMLButtonElement {
    const button = el('button', className)
    button.type = 'button'
    button.dataset.focusKey = `${className.split(' ')[0]}:${login.toLowerCase()}`
    button.append(el('span', 'person-label', login))
    button.addEventListener('click', () => handlers.onSelect(login))
    return button
  }

  show(null)
  return { element, show }
}
