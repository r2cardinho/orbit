// Small hint that appears next to a button on mouse hover or keyboard focus.
// The button needs the `has-tooltip` class. The hint is hidden from screen readers
// because the button's own label already says the same thing.

export type TooltipPlacement = 'right' | 'bottom' | 'bottom-end'

export function tooltip(text: string, placement: TooltipPlacement, hint?: string): string {
  const hintHtml = hint === undefined ? '' : `<span class="tooltip-hint">${hint}</span>`
  return `<span class="tooltip tooltip--${placement}" aria-hidden="true">${text}${hintHtml}</span>`
}
