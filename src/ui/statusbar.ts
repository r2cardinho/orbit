// Status bar under the graph: map totals and GitHub requests left.

import type { RateLimit } from '../api/github.ts'
import { strings } from './strings.ts'

export interface MapTotals {
  people: number
  connections: number
  mutual: number
}

export interface Statusbar {
  element: HTMLElement
  setTotals(totals: MapTotals): void
  setRateLimit(rateLimit: RateLimit): void
}

export function createStatusbar(): Statusbar {
  const text = strings.statusbar
  const element = document.createElement('footer')
  element.className = 'statusbar'
  element.setAttribute('aria-label', text.label)
  element.innerHTML = `
    <span data-total="people"></span>
    <span data-total="connections"></span>
    <span data-total="mutual"></span>
    <span data-total="requests" hidden></span>
  `

  const field = (name: string) => element.querySelector<HTMLElement>(`[data-total="${name}"]`)!
  const people = field('people')
  const connections = field('connections')
  const mutual = field('mutual')
  const requests = field('requests')

  return {
    element,
    setTotals: (totals) => {
      people.textContent = text.people(totals.people)
      connections.textContent = text.connections(totals.connections)
      mutual.textContent = text.mutual(totals.mutual)
    },
    // Hidden until the first response, because only GitHub knows the real numbers.
    setRateLimit: (rateLimit) => {
      requests.textContent = text.requestsLeft(rateLimit.remaining, rateLimit.limit)
      requests.hidden = false
    },
  }
}
