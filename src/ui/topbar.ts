// Top bar: app name on the left, search in the middle, "Add token" on the right.
// On phones (below 760px) it becomes: menu (opens the people list), search, and a
// button that opens "Map settings". Those two buttons only show on phones (CSS).

import { icons } from './icons.ts'
import { PEOPLE_LIST_ID } from './people-list.ts'
import { SETTINGS_PANEL_ID } from './settings-panel.ts'
import { strings } from './strings.ts'

export interface TopbarHandlers {
  /** Called with the cleaned-up username when the search is submitted. */
  onSearch(login: string): void
  onAddToken(): void
  onToggleMenu(): void
  onToggleSettings(): void
}

export interface Topbar {
  element: HTMLElement
  setQuery(value: string): void
  focusSearch(): void
  /** With a token the button reads "Edit token" instead of "Add token". */
  setHasToken(hasToken: boolean): void
  setMenuOpen(open: boolean): void
  setSettingsOpen(open: boolean): void
}

/** "  @Torvalds " -> "Torvalds" */
function cleanLogin(value: string): string {
  return value.trim().replace(/^@/, '')
}

export function createTopbar(handlers: TopbarHandlers): Topbar {
  const text = strings.topbar
  const element = document.createElement('header')
  element.className = 'topbar'
  element.innerHTML = `
    <div class="topbar-start">
      <button class="icon-button topbar-icon-button phone-only" type="button" data-action="menu"
        aria-controls="${PEOPLE_LIST_ID}" aria-expanded="false" aria-label="${text.menu}">${icons.menu}</button>
      <div class="topbar-brand">
        ${icons.logo}
        <span>${strings.appName}</span>
      </div>
    </div>
    <form class="search" role="search">
      <input class="search-input" type="text" name="login" autocomplete="off" autocapitalize="off"
        spellcheck="false" aria-label="${text.searchLabel}" placeholder="${text.searchPlaceholder}">
      <button class="search-button icon-button" type="submit" aria-label="${text.searchSubmit}">${icons.search}</button>
    </form>
    <div class="topbar-actions">
      <button class="button token-button" type="button" aria-haspopup="dialog">
        ${icons.key}
        <span class="token-button-label">${text.addToken}</span>
      </button>
      <button class="icon-button topbar-icon-button phone-only" type="button" data-action="settings"
        aria-controls="${SETTINGS_PANEL_ID}" aria-expanded="false" aria-label="${text.settings}">${icons.sliders}</button>
    </div>
  `

  const form = element.querySelector<HTMLFormElement>('.search')!
  const input = element.querySelector<HTMLInputElement>('.search-input')!

  form.addEventListener('submit', (event) => {
    event.preventDefault() // stay on the page instead of reloading it
    const login = cleanLogin(input.value)
    if (login === '') {
      input.focus()
      return
    }
    handlers.onSearch(login)
  })

  element.querySelector('.token-button')!.addEventListener('click', () => handlers.onAddToken())
  const tokenLabel = element.querySelector<HTMLElement>('.token-button-label')!
  const menuButton = element.querySelector<HTMLButtonElement>('[data-action="menu"]')!
  const settingsButton = element.querySelector<HTMLButtonElement>('[data-action="settings"]')!
  menuButton.addEventListener('click', () => handlers.onToggleMenu())
  settingsButton.addEventListener('click', () => handlers.onToggleSettings())

  return {
    element,
    setHasToken: (hasToken) => {
      tokenLabel.textContent = hasToken ? text.editToken : text.addToken
    },
    setQuery: (value) => {
      input.value = value
    },
    focusSearch: () => input.focus(),
    setMenuOpen: (open) => menuButton.setAttribute('aria-expanded', String(open)),
    setSettingsOpen: (open) => settingsButton.setAttribute('aria-expanded', String(open)),
  }
}
