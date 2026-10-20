// "People on this map": everyone on the map, grouped by state, with a name filter.
// Groups can be collapsed, and long groups show only the first rows plus "Show N more".

import { icons } from './icons.ts'
import { strings } from './strings.ts'

export type PersonGroup = 'center' | 'expanded' | 'idle'

export interface PersonEntry {
  login: string
  group: PersonGroup
  /** In common with the center (shown with the highlighter). */
  common: boolean
}

export interface PeopleListHandlers {
  onSelect(login: string): void
}

export interface PeopleList {
  element: HTMLElement
  update(people: PersonEntry[], selected: string | null): void
}

export const PEOPLE_LIST_ID = 'people-list'
const ROWS_BEFORE_SHOW_MORE = 10

const GROUPS: { id: PersonGroup; name: string }[] = [
  { id: 'center', name: strings.peopleList.center },
  { id: 'expanded', name: strings.peopleList.expanded },
  { id: 'idle', name: strings.peopleList.notExpanded },
]

function sameLogin(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase()
}

export function createPeopleList(handlers: PeopleListHandlers): PeopleList {
  const text = strings.peopleList
  const element = document.createElement('aside')
  element.className = 'sidebar people-list'
  element.id = PEOPLE_LIST_ID
  element.setAttribute('aria-label', text.title)
  element.innerHTML = `
    <div class="sidebar-header">
      <h2 class="sidebar-title">${text.title}</h2>
      <span class="sidebar-count"></span>
    </div>
    <input class="text-field people-filter" type="search" autocomplete="off" spellcheck="false"
      aria-label="${text.filterLabel}" placeholder="${text.filterLabel}">
    <div class="people-groups"></div>
  `

  const count = element.querySelector<HTMLElement>('.sidebar-count')!
  const filterInput = element.querySelector<HTMLInputElement>('.people-filter')!
  const groupsElement = element.querySelector<HTMLElement>('.people-groups')!

  // What the list is showing, kept so the filter can redraw without new data.
  let people: PersonEntry[] = []
  let selected: string | null = null
  const collapsed = new Set<PersonGroup>()
  const showingAll = new Set<PersonGroup>()

  filterInput.addEventListener('input', () => render())

  // Redrawing replaces the buttons, so the one with keyboard focus is found again by its key.
  function render(): void {
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset.focusKey
    draw()
    if (focusKey !== undefined) {
      groupsElement.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus()
    }
  }

  function draw(): void {
    count.textContent = people.length === 0 ? '' : String(people.length)
    groupsElement.replaceChildren()

    if (people.length === 0) {
      groupsElement.append(paragraph('people-empty', text.empty))
      return
    }

    const filter = filterInput.value.trim().toLowerCase()
    const matches = people
      .filter((person) => person.login.toLowerCase().includes(filter))
      .sort((a, b) => a.login.localeCompare(b.login, 'en', { sensitivity: 'base' }))

    if (matches.length === 0) {
      groupsElement.append(paragraph('people-empty', text.noMatches(filterInput.value.trim())))
      return
    }

    for (const group of GROUPS) {
      const members = matches.filter((person) => person.group === group.id)
      if (members.length > 0) groupsElement.append(renderGroup(group, members, filter !== ''))
    }
  }

  function renderGroup(group: (typeof GROUPS)[number], members: PersonEntry[], filtering: boolean): HTMLElement {
    const section = document.createElement('section')
    section.className = 'people-group'
    const isCollapsed = collapsed.has(group.id)

    // Group header: a button that collapses or opens the group.
    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'people-group-header'
    header.dataset.focusKey = `group:${group.id}`
    header.setAttribute('aria-expanded', String(!isCollapsed))
    header.innerHTML = icons.chevronDown
    header.append(group.id === 'center' ? group.name : text.groupWithCount(group.name, members.length))
    header.addEventListener('click', () => {
      if (collapsed.has(group.id)) collapsed.delete(group.id)
      else collapsed.add(group.id)
      render()
    })
    section.append(header)
    if (isCollapsed) return section

    // Long groups show only the first rows, unless the selected person is further down
    // (so the selection is always visible) or the user is filtering.
    const selectedIsHidden = members.findIndex((person) => sameLogin(selected, person.login)) >= ROWS_BEFORE_SHOW_MORE
    const showAll = showingAll.has(group.id) || filtering || selectedIsHidden
    const visible = showAll ? members : members.slice(0, ROWS_BEFORE_SHOW_MORE)

    const list = document.createElement('ul')
    list.className = 'people-rows'
    for (const person of visible) list.append(renderRow(person))
    section.append(list)

    if (visible.length < members.length) {
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'people-show-more'
      more.textContent = text.showMore(members.length - visible.length)
      more.addEventListener('click', () => {
        showingAll.add(group.id)
        render()
      })
      section.append(more)
    }
    return section
  }

  function renderRow(person: PersonEntry): HTMLElement {
    const item = document.createElement('li')
    const isSelected = sameLogin(selected, person.login)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `person-row person-row--${person.group}`
    button.dataset.focusKey = `person:${person.login.toLowerCase()}`
    if (isSelected) {
      button.classList.add('is-selected')
      button.setAttribute('aria-current', 'true')
    }
    button.addEventListener('click', () => handlers.onSelect(person.login))

    const dot = document.createElement('span')
    dot.className = 'person-dot'
    dot.setAttribute('aria-hidden', 'true')

    const name = document.createElement('span')
    name.className = person.common ? 'person-name marker' : 'person-name'
    name.textContent = person.login // exactly as it came from GitHub

    button.append(dot, name)
    item.append(button)
    return item
  }

  return {
    element,
    update: (nextPeople, nextSelected) => {
      people = nextPeople
      selected = nextSelected
      render()
      // Keep the selected row in view when it was chosen on the map.
      element.querySelector('.person-row.is-selected')?.scrollIntoView({ block: 'nearest' })
    },
  }
}

function paragraph(className: string, content: string): HTMLElement {
  const p = document.createElement('p')
  p.className = className
  p.textContent = content
  return p
}
