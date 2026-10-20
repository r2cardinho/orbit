// "Add token" window: a short guide to create a GitHub token, the field to paste it,
// and a note on privacy. The token is checked with GitHub before it is accepted.
// Built on <dialog>, which keeps the keyboard inside the window and closes with Esc.

import { icons } from './icons.ts'
import { strings } from './strings.ts'

export interface TokenDialogHandlers {
  /** Checks and keeps the token. Resolves to an error message, or `null` when it worked. */
  onSave(token: string): Promise<string | null>
  onRemove(): void
}

export interface TokenDialog {
  element: HTMLDialogElement
  open(hasToken: boolean): void
}

/** A link that opens in a new tab and says so to screen readers. */
function externalLink(href: string, label: string): string {
  return `<a href="${href}" target="_blank" rel="noopener">${label}${icons.external}<span class="visually-hidden"> ${strings.tokenDialog.newTab}</span></a>`
}

export function createTokenDialog(handlers: TokenDialogHandlers): TokenDialog {
  const text = strings.tokenDialog
  const element = document.createElement('dialog')
  element.className = 'dialog'
  element.setAttribute('aria-labelledby', 'token-dialog-title')
  element.innerHTML = `
    <form class="dialog-body" novalidate>
      <h2 class="dialog-title" id="token-dialog-title">${text.title}</h2>
      <p class="dialog-text">${text.intro}</p>
      <p class="dialog-status" hidden>${icons.success}<span>${text.active}</span></p>

      <h3 class="dialog-subtitle">${text.howTo}</h3>
      <ol class="token-steps">
        ${text.steps.map((step) => `<li>${step}</li>`).join('')}
      </ol>
      <p class="dialog-text">${externalLink(strings.links.createToken, text.createLink)}</p>

      <label class="field">
        <span class="field-label">${text.fieldLabel}</span>
        <input class="text-field" type="password" name="token" autocomplete="off" spellcheck="false"
          placeholder="${text.fieldPlaceholder}" aria-describedby="token-error token-privacy">
      </label>
      <p class="dialog-error" id="token-error" hidden></p>
      <p class="dialog-note" id="token-privacy">${text.privacy}</p>
      <p class="dialog-note">${text.source} ${externalLink(strings.links.tokenDocs, text.sourceLink)}</p>

      <footer class="dialog-actions">
        <button class="button" type="button" data-action="remove">${text.remove}</button>
        <button class="button" type="button" data-action="cancel">${text.cancel}</button>
        <button class="button button--accent" type="submit" data-action="save">${text.save}</button>
      </footer>
    </form>
  `

  const form = element.querySelector<HTMLFormElement>('form')!
  const input = element.querySelector<HTMLInputElement>('input[name="token"]')!
  const status = element.querySelector<HTMLElement>('.dialog-status')!
  const errorText = element.querySelector<HTMLElement>('.dialog-error')!
  const removeButton = element.querySelector<HTMLButtonElement>('[data-action="remove"]')!
  const saveButton = element.querySelector<HTMLButtonElement>('[data-action="save"]')!
  let saving = false

  function showError(message: string | null): void {
    errorText.textContent = message ?? ''
    errorText.hidden = message === null
    input.setAttribute('aria-invalid', String(message !== null))
  }

  function close(): void {
    input.value = '' // never leave the token sitting in the field
    showError(null)
    element.close()
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (saving) return
    const token = input.value.trim()
    if (token === '') {
      showError(text.empty)
      input.focus()
      return
    }

    saving = true
    saveButton.textContent = text.checking
    saveButton.setAttribute('aria-disabled', 'true')
    const error = await handlers.onSave(token)
    saving = false
    saveButton.textContent = text.save
    saveButton.removeAttribute('aria-disabled')

    if (error === null) close()
    else {
      showError(error)
      input.focus()
    }
  })

  element.querySelector('[data-action="cancel"]')!.addEventListener('click', close)
  removeButton.addEventListener('click', () => {
    handlers.onRemove()
    close()
  })
  // Esc closes the dialog by itself; this clears the field in that case too.
  element.addEventListener('close', () => {
    input.value = ''
    showError(null)
  })

  return {
    element,
    open: (hasToken) => {
      status.hidden = !hasToken
      removeButton.hidden = !hasToken
      element.showModal()
      input.focus()
    },
  }
}
