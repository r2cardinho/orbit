// Ribbon: the column of icon buttons on the left edge.
// "People on this map" opens and closes the people list. The other two are planned
// for phase 2, so they stay disabled with a "Coming soon" hint.

import { icons } from './icons.ts'
import { PEOPLE_LIST_ID } from './people-list.ts'
import { strings } from './strings.ts'
import { tooltip } from './tooltip.ts'

export interface RibbonHandlers {
  onTogglePeople(): void
}

export interface Ribbon {
  element: HTMLElement
  setPeopleOpen(open: boolean): void
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
  `

  const peopleButton = element.querySelector<HTMLButtonElement>('[data-action="people"]')!
  peopleButton.addEventListener('click', () => handlers.onTogglePeople())

  return {
    element,
    setPeopleOpen: (open) => {
      peopleButton.classList.toggle('is-active', open)
      peopleButton.setAttribute('aria-expanded', String(open))
    },
  }
}
