// Notice at the top of the map: "Loading…", a success or an error.
// - loading: spinner, stays until replaced by the result;
// - success: closes itself after a few seconds (--dur-notice);
// - error: stays until closed, and can carry an action button (e.g. "Add token").
// Screen readers hear every new notice; errors interrupt, the others wait their turn.

import { icons } from './icons.ts'
import { strings } from './strings.ts'

export type NoticeKind = 'loading' | 'success' | 'error'

export interface Notice {
  kind: NoticeKind
  /** Bold first part, e.g. "carol-ti expanded." */
  title?: string
  /** Regular text after the title, e.g. "6 new people on the map." */
  detail?: string
  action?: { label: string; onClick(): void }
}

export interface Infobar {
  element: HTMLElement
  show(notice: Notice): void
  hide(): void
}

function noticeDuration(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--dur-notice')
  return parseFloat(value) * 1000 // "5s" -> 5000 ms
}

export function createInfobar(): Infobar {
  const element = document.createElement('div')
  element.className = 'infobar'
  element.setAttribute('role', 'status')
  element.hidden = true

  let hideTimer: number | undefined

  function hide(): void {
    window.clearTimeout(hideTimer)
    element.hidden = true
    element.replaceChildren()
  }

  function show(notice: Notice): void {
    window.clearTimeout(hideTimer)
    element.dataset.kind = notice.kind
    element.setAttribute('aria-live', notice.kind === 'error' ? 'assertive' : 'polite')
    element.replaceChildren()

    const marker = document.createElement('span')
    marker.className = 'infobar-icon'
    marker.setAttribute('aria-hidden', 'true')
    if (notice.kind === 'loading') marker.classList.add('spinner')
    else marker.innerHTML = notice.kind === 'success' ? icons.success : icons.error

    const message = document.createElement('p')
    message.className = 'infobar-message'
    if (notice.title !== undefined) {
      const title = document.createElement('strong')
      title.textContent = notice.title
      message.append(title)
      if (notice.detail !== undefined) message.append(' ')
    }
    if (notice.detail !== undefined) message.append(notice.detail)

    element.append(marker, message)

    if (notice.action !== undefined) {
      const action = notice.action
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'button infobar-action'
      button.textContent = action.label
      button.addEventListener('click', () => {
        hide()
        action.onClick()
      })
      element.append(button)
    }

    if (notice.kind !== 'loading') {
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'icon-button infobar-close'
      close.setAttribute('aria-label', strings.notices.close)
      close.innerHTML = icons.close
      close.addEventListener('click', hide)
      element.append(close)
    }

    element.hidden = false
    if (notice.kind === 'success') hideTimer = window.setTimeout(hide, noticeDuration())
  }

  return { element, show, hide }
}
