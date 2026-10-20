// Ribbon: the column of icon buttons on the left edge.
// "People on this map" is the current view. The other two are planned for phase 2,
// so they stay disabled with a "Coming soon" hint.

import { icons } from './icons.ts'
import { strings } from './strings.ts'
import { tooltip } from './tooltip.ts'

export function createRibbon(): HTMLElement {
  const text = strings.ribbon
  const element = document.createElement('nav')
  element.className = 'ribbon'
  element.setAttribute('aria-label', text.label)
  element.innerHTML = `
    <button class="ribbon-button has-tooltip is-active" type="button" aria-pressed="true" aria-label="${text.people}">
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
  return element
}
