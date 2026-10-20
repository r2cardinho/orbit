// Controls in the bottom corners of the map:
// - legend (bottom left): what each dot, line and highlight means;
// - zoom (bottom right): zoom out, current level, zoom in, and "show the whole map".

import { icons } from './icons.ts'
import { strings } from './strings.ts'
import { tooltip } from './tooltip.ts'

export interface MapControlsHandlers {
  onZoomIn(): void
  onZoomOut(): void
  onFit(): void
}

export interface MapControls {
  legend: HTMLElement
  zoom: HTMLElement
  setZoom(percent: number): void
}

// Thin arrow, drawn like the "follows" lines on the map.
const ARROW = `<svg class="legend-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"
  fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2.5 10h14M13 7l3.5 3-3.5 3"/></svg>`

export function createMapControls(handlers: MapControlsHandlers): MapControls {
  const text = strings.legend
  const legend = document.createElement('div')
  legend.className = 'flyout legend'
  legend.setAttribute('role', 'group')
  legend.setAttribute('aria-label', text.label)
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-dot legend-dot--center"></span>${text.center}</span>
    <span class="legend-item"><span class="legend-dot legend-dot--expanded"></span>${text.expanded}</span>
    <span class="legend-item"><span class="legend-dot legend-dot--idle"></span>${text.notExpanded}</span>
    <span class="legend-item legend-item--follows">${ARROW}${text.follows}</span>
    <span class="legend-item legend-item--mutual">${icons.mutual}${text.mutual}</span>
    <span class="legend-item"><span class="legend-swatch"></span>${text.inCommon}</span>
  `

  const zoomText = strings.zoom
  const zoom = document.createElement('div')
  zoom.className = 'zoom-controls'
  zoom.innerHTML = `
    <div class="flyout zoom-group" role="group" aria-label="${zoomText.label}">
      <button class="icon-button" type="button" data-zoom="out" aria-label="${zoomText.zoomOut}">${icons.minus}</button>
      <span class="zoom-level"></span>
      <button class="icon-button" type="button" data-zoom="in" aria-label="${zoomText.zoomIn}">${icons.add}</button>
    </div>
    <button class="flyout icon-button zoom-fit has-tooltip" type="button" aria-label="${zoomText.fit}">
      ${icons.fit}
      ${tooltip(zoomText.fit, 'top-end')}
    </button>
  `

  zoom.querySelector('[data-zoom="out"]')!.addEventListener('click', () => handlers.onZoomOut())
  zoom.querySelector('[data-zoom="in"]')!.addEventListener('click', () => handlers.onZoomIn())
  zoom.querySelector('.zoom-fit')!.addEventListener('click', () => handlers.onFit())
  const level = zoom.querySelector<HTMLElement>('.zoom-level')!

  return {
    legend,
    zoom,
    setZoom: (percent) => {
      level.textContent = zoomText.level(percent)
    },
  }
}
