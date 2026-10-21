// "Map settings": floating panel over the map, in three collapsible sections.
// - Filters: "Mutual only" and "Show not expanded" (on/off switches);
// - Display: "Node size" and "Spacing" (sliders, in percent of the normal value);
// - GitHub requests: "Per click", how many people each list loads per click, and the
//   token button (on phones the top bar has no room for it, so it lives here too).
// Every change is reported at once with the full settings, so main.ts can apply them.

import { icons } from './icons.ts'
import { strings } from './strings.ts'

export interface MapSettings {
  mutualOnly: boolean
  showNotExpanded: boolean
  nodeSize: number // percent
  spacing: number // percent
  perClick: number
}

export const DEFAULT_SETTINGS: MapSettings = {
  mutualOnly: false,
  showNotExpanded: true,
  nodeSize: 100,
  spacing: 100,
  perClick: 20,
}

const NODE_SIZE = { min: 50, max: 150, step: 10 }
const SPACING = { min: 50, max: 200, step: 10 }
const PER_CLICK_OPTIONS = [10, 20, 30, 50, 100] // GitHub allows at most 100 per page

export interface SettingsPanelHandlers {
  onChange(settings: MapSettings): void
  onClose(): void
  onAddToken(): void
}

export interface SettingsPanel {
  element: HTMLElement
  setOpen(open: boolean): void
  setHasToken(hasToken: boolean): void
}

export const SETTINGS_PANEL_ID = 'map-settings'

export function createSettingsPanel(handlers: SettingsPanelHandlers): SettingsPanel {
  const text = strings.settings
  const settings: MapSettings = { ...DEFAULT_SETTINGS }

  const element = document.createElement('section')
  element.className = 'flyout settings-panel'
  element.id = SETTINGS_PANEL_ID
  element.setAttribute('aria-labelledby', 'map-settings-title')
  element.innerHTML = `
    <header class="flyout-header">
      <h2 class="flyout-title" id="map-settings-title">${text.title}</h2>
      <button class="icon-button flyout-close" type="button" aria-label="${text.close}">${icons.close}</button>
    </header>

    ${section('filters', text.filters, true, `
      <label class="setting-row">
        <span>${text.mutualOnly}</span>
        <input class="toggle" type="checkbox" role="switch" data-setting="mutualOnly">
      </label>
      <label class="setting-row">
        <span>${text.showNotExpanded}</span>
        <input class="toggle" type="checkbox" role="switch" data-setting="showNotExpanded">
      </label>
    `)}

    ${section('display', text.display, true, `
      ${slider('nodeSize', text.nodeSize, NODE_SIZE)}
      ${slider('spacing', text.spacing, SPACING)}
    `)}

    ${section('requests', text.requests, false, `
      <label class="setting-row">
        <span>${text.perClick}</span>
        <select class="select" data-setting="perClick" aria-describedby="per-click-hint">
          ${PER_CLICK_OPTIONS.map((value) => `<option value="${value}">${value}</option>`).join('')}
        </select>
      </label>
      <p class="setting-hint" id="per-click-hint">${text.perClickHint}</p>
      <div class="setting-row">
        <span>${text.token}</span>
        <button class="button token-button" type="button" aria-haspopup="dialog">
          ${icons.key}<span class="token-button-label">${strings.topbar.addToken}</span>
        </button>
      </div>
    `)}
  `

  // ---------- Initial values ----------

  const input = (name: string) => element.querySelector<HTMLInputElement>(`[data-setting="${name}"]`)!
  const mutualOnly = input('mutualOnly')
  const showNotExpanded = input('showNotExpanded')
  const nodeSize = input('nodeSize')
  const spacing = input('spacing')
  const perClick = element.querySelector<HTMLSelectElement>('[data-setting="perClick"]')!

  mutualOnly.checked = settings.mutualOnly
  showNotExpanded.checked = settings.showNotExpanded
  nodeSize.value = String(settings.nodeSize)
  spacing.value = String(settings.spacing)
  perClick.value = String(settings.perClick)
  updateSlider(nodeSize)
  updateSlider(spacing)

  // ---------- Events ----------

  element.querySelector('.flyout-close')!.addEventListener('click', () => handlers.onClose())
  element.querySelector('.token-button')!.addEventListener('click', () => handlers.onAddToken())
  const tokenLabel = element.querySelector<HTMLElement>('.token-button-label')!

  for (const header of element.querySelectorAll<HTMLButtonElement>('.flyout-section-header')) {
    header.addEventListener('click', () => {
      const open = header.getAttribute('aria-expanded') !== 'true'
      header.setAttribute('aria-expanded', String(open))
      element.querySelector<HTMLElement>(`#${header.getAttribute('aria-controls')}`)!.hidden = !open
    })
  }

  mutualOnly.addEventListener('change', () => change({ mutualOnly: mutualOnly.checked }))
  showNotExpanded.addEventListener('change', () => change({ showNotExpanded: showNotExpanded.checked }))
  nodeSize.addEventListener('input', () => {
    updateSlider(nodeSize)
    change({ nodeSize: Number(nodeSize.value) })
  })
  spacing.addEventListener('input', () => {
    updateSlider(spacing)
    change({ spacing: Number(spacing.value) })
  })
  perClick.addEventListener('change', () => change({ perClick: Number(perClick.value) }))

  function change(part: Partial<MapSettings>): void {
    Object.assign(settings, part)
    handlers.onChange({ ...settings })
  }

  return {
    element,
    setOpen: (open) => {
      element.hidden = !open
    },
    setHasToken: (hasToken) => {
      tokenLabel.textContent = hasToken ? strings.topbar.editToken : strings.topbar.addToken
    },
  }
}

// ---------- Pieces of HTML ----------

/** A section with a header button that opens and closes it. */
function section(id: string, title: string, open: boolean, content: string): string {
  const bodyId = `settings-${id}`
  return `
    <div class="flyout-section">
      <button class="flyout-section-header" type="button" aria-expanded="${open}" aria-controls="${bodyId}">
        ${icons.chevronDown}<span>${title}</span>
      </button>
      <div class="flyout-section-body" id="${bodyId}" ${open ? '' : 'hidden'}>${content}</div>
    </div>
  `
}

function slider(name: string, label: string, range: { min: number; max: number; step: number }): string {
  return `
    <label class="setting-slider">
      <span>${label}</span>
      <input class="slider" type="range" data-setting="${name}"
        min="${range.min}" max="${range.max}" step="${range.step}">
    </label>
  `
}

/**
 * Paints the slider's track purple up to the thumb (through the --fill variable)
 * and tells screen readers the value as a percentage.
 */
function updateSlider(input: HTMLInputElement): void {
  const min = Number(input.min)
  const max = Number(input.max)
  const value = Number(input.value)
  input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`)
  input.setAttribute('aria-valuetext', strings.settings.percent(value))
}
