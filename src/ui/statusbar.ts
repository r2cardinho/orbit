// Status bar under the graph: map totals and GitHub requests left.
// Hovering (or focusing) the requests shows a countdown to when GitHub refills them.
// On phones it becomes one line over the map, "18 people, 21 connections, 7 mutual":
// the commas only show there.

import type { RateLimit } from '../api/github.ts'
import { icons } from './icons.ts'
import { formatCountdown, strings } from './strings.ts'

export interface MapTotals {
  people: number
  connections: number
  mutual: number
}

export interface StatusbarHandlers {
  /** Called once when the countdown reaches zero, so fresh numbers can be fetched. */
  onRateLimitReset(): void
}

export interface Statusbar {
  element: HTMLElement
  setTotals(totals: MapTotals): void
  setRateLimit(rateLimit: RateLimit): void
}

const COUNTDOWN_ID = 'rate-limit-countdown'

export function createStatusbar(handlers: StatusbarHandlers): Statusbar {
  const text = strings.statusbar
  const element = document.createElement('footer')
  element.className = 'statusbar'
  element.setAttribute('aria-label', text.label)
  element.innerHTML = `
    <span data-total="people"></span><span class="status-separator">${strings.list.separator}</span>
    <span data-total="connections"></span><span class="status-separator">${strings.list.separator}</span>
    <span data-total="mutual"></span>
    <span class="status-requests has-tooltip" tabindex="0" aria-describedby="${COUNTDOWN_ID}" hidden>
      ${icons.recent}
      <span class="status-requests-text"></span>
      <span class="tooltip tooltip--top-end" id="${COUNTDOWN_ID}" role="tooltip">
        <span class="countdown-time"></span>
        <span class="tooltip-hint countdown-at"></span>
      </span>
    </span>
  `

  const field = (name: string) => element.querySelector<HTMLElement>(`[data-total="${name}"]`)!
  const people = field('people')
  const connections = field('connections')
  const mutual = field('mutual')
  const requests = element.querySelector<HTMLElement>('.status-requests')!
  const requestsText = element.querySelector<HTMLElement>('.status-requests-text')!
  const countdownTime = element.querySelector<HTMLElement>('.countdown-time')!
  const countdownAt = element.querySelector<HTMLElement>('.countdown-at')!

  let resetAt: Date | null = null
  let resetHandled = false // so the refill is announced only once per countdown
  let full = false // nothing used yet

  function updateCountdown(): void {
    if (resetAt === null) return

    // GitHub's hour starts with the first request used. Before that, the reset time it
    // sends is just "one hour from now" and keeps moving, so there is nothing to count.
    if (full) {
      countdownTime.textContent = text.full
      countdownAt.textContent = text.fullHint
      return
    }

    const timeLeft = resetAt.getTime() - Date.now()

    if (timeLeft <= 0) {
      countdownTime.textContent = text.resetNow
      countdownAt.textContent = ''
      if (!resetHandled) {
        resetHandled = true
        handlers.onRateLimitReset()
      }
      return
    }
    countdownTime.textContent = text.resetsIn(formatCountdown(timeLeft))
    countdownAt.textContent = text.resetsAt(resetAt)
  }

  // Ticks every second. It only changes a few characters, so it costs almost nothing.
  window.setInterval(updateCountdown, 1000)

  return {
    element,
    setTotals: (totals) => {
      people.textContent = text.people(totals.people)
      connections.textContent = text.connections(totals.connections)
      mutual.textContent = text.mutual(totals.mutual)
    },
    // Hidden until the first response, because only GitHub knows the real numbers.
    setRateLimit: (rateLimit) => {
      requestsText.textContent = text.requestsLeft(rateLimit.remaining, rateLimit.limit)
      requests.hidden = false
      resetAt = rateLimit.resetAt
      full = rateLimit.remaining >= rateLimit.limit
      // If GitHub sends a time that already passed, do not ask again in a loop.
      resetHandled = rateLimit.resetAt.getTime() <= Date.now()
      updateCountdown()
    },
  }
}
