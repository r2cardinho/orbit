// Top bar: app name on the left, search in the middle, "Add token" on the right.

import { icons } from './icons.ts'
import { strings } from './strings.ts'
import { tooltip } from './tooltip.ts'

export interface TopbarHandlers {
  /** Called with the cleaned-up username when the search is submitted. */
  onSearch(login: string): void
}

export interface Topbar {
  element: HTMLElement
  setQuery(value: string): void
  focusSearch(): void
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
    <div class="topbar-brand">
      ${icons.logo}
      <span>${strings.appName}</span>
    </div>
    <form class="search" role="search">
      <input class="search-input" type="text" name="login" autocomplete="off" autocapitalize="off"
        spellcheck="false" aria-label="${text.searchLabel}" placeholder="${text.searchPlaceholder}">
      <button class="search-button icon-button" type="submit" aria-label="${text.searchSubmit}">${icons.search}</button>
    </form>
    <div class="topbar-actions">
      <!-- The token window arrives in a later step. -->
      <button class="button has-tooltip" type="button" aria-disabled="true"
        aria-label="${text.addToken}. ${strings.comingSoon}">
        ${icons.key}
        <span>${text.addToken}</span>
        ${tooltip(strings.comingSoon, 'bottom-end')}
      </button>
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

  return {
    element,
    setQuery: (value) => {
      input.value = value
    },
    focusSearch: () => input.focus(),
  }
}
