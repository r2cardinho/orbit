// Tabs above the graph. For now there is a single tab, named after the person at
// the center. Several tabs (the "+" button) come in phase 2.

import { icons } from './icons.ts'
import { strings } from './strings.ts'
import { tooltip } from './tooltip.ts'

export interface TabsHandlers {
  onClose(): void
}

export interface Tabs {
  element: HTMLElement
  /** Shows the center's login on the tab, or "New map" when the map is empty. */
  setTitle(center: string | null): void
}

export const MAP_PANEL_ID = 'map-panel'
export const MAP_TAB_ID = 'map-tab'

export function createTabs(handlers: TabsHandlers): Tabs {
  const text = strings.tabs
  const element = document.createElement('div')
  element.className = 'tabs'
  element.innerHTML = `
    <div class="tablist" role="tablist" aria-label="${text.label}">
      <div class="tab is-active">
        <button class="tab-select" id="${MAP_TAB_ID}" type="button" role="tab" aria-selected="true" aria-controls="${MAP_PANEL_ID}">
          <span class="tab-dot" aria-hidden="true"></span>
          <span class="tab-label"></span>
        </button>
        <button class="tab-close icon-button" type="button">${icons.close}</button>
      </div>
    </div>
    <button class="tab-add icon-button has-tooltip" type="button" aria-disabled="true"
      aria-label="${text.newTab}. ${strings.comingSoon}">
      ${icons.add}
      ${tooltip(text.newTab, 'bottom', strings.comingSoon)}
    </button>
  `

  const label = element.querySelector<HTMLElement>('.tab-label')!
  const close = element.querySelector<HTMLButtonElement>('.tab-close')!
  close.addEventListener('click', () => handlers.onClose())

  return {
    element,
    setTitle: (center) => {
      const title = center ?? text.newMap
      label.textContent = title // textContent: a login is shown exactly as it came, never as HTML
      close.hidden = center === null
      close.setAttribute('aria-label', text.close(title))
    },
  }
}
