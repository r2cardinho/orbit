// Ribbon: the column of icon buttons on the left edge.
// "People on this map" opens and closes the people list, and the gear at the bottom
// opens and closes "Map settings". "Path between two people" and "Recent maps" are
// planned for phase 2, so they stay disabled with a "Coming soon" hint.

import { icons } from './icons.ts'
import { PEOPLE_LIST_ID } from './people-list.ts'
import { SETTINGS_PANEL_ID } from './settings-panel.ts'
import { strings } from './strings.ts'
import { tooltip } from './tooltip.ts'

export interface RibbonHandlers {
  onTogglePeople(): void
  onToggleSettings(): void
}

export interface Ribbon {
  element: HTMLElement
  setPeopleOpen(open: boolean): void
  setSettingsOpen(open: boolean): void
}

export function createRibbon(handlers: RibbonHandlers): Ribbon {
  const text = strings.ribbon
  const element = document.createElement('nav')
  element.className = 'ribbon'
  element.setAttribute('aria-label', text.label)
  element.innerHTML = `
    <button class="ribbon-button has-tooltip" type="button" data-action="people"
      aria-controls="${PEOPLE_LIST_ID}" aria-label="${text.people}">
      ${icons.people}
      ${tooltip(text.people, 'right')}
    </button>
    <button class="ribbon-button has-tooltip" type="button" aria-disabled="true"
      aria-label="${text.path}. ${strings.comingSoon}">
      ${icons.path}
      ${tooltip(text.path, 'right', strings.comingSoon)}
    </button>
    <button class="ribbon-button has-tooltip" type="button" aria-disabled="true"
      aria-label="${text.recentMaps}. ${strings.comingSoon}">
      ${icons.recent}
      ${tooltip(text.recentMaps, 'right', strings.comingSoon)}
    </button>
    <button class="ribbon-button ribbon-settings has-tooltip" type="button" data-action="settings"
      aria-controls="${SETTINGS_PANEL_ID}" aria-label="${text.settings}">
      ${icons.settings}
      ${tooltip(text.settings, 'right')}
    </button>
  `

  const peopleButton = element.querySelector<HTMLButtonElement>('[data-action="people"]')!
  peopleButton.addEventListener('click', () => handlers.onTogglePeople())
  const settingsButton = element.querySelector<HTMLButtonElement>('[data-action="settings"]')!
  settingsButton.addEventListener('click', () => handlers.onToggleSettings())

  return {
    element,
    setPeopleOpen: (open) => {
      peopleButton.classList.toggle('is-active', open)
      peopleButton.setAttribute('aria-expanded', String(open))
    },
    setSettingsOpen: (open) => {
      settingsButton.classList.toggle('is-active', open)
      settingsButton.setAttribute('aria-expanded', String(open))
    },
  }
}
