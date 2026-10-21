// Interface icons as inline SVG, in the thin line style of Windows 11.
// They use `currentColor`, so their color always comes from the CSS around them.
// All of them are decorative (`aria-hidden`): the button that holds an icon carries the label.

function icon(content: string, filled = false): string {
  const paint = filled
    ? 'fill="currentColor" stroke="currentColor"'
    : 'fill="none" stroke="currentColor"'
  return `<svg class="icon" viewBox="0 0 20 20" width="20" height="20" ${paint} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`
}

// Three people connected in a triangle.
const nodes = '<path d="M10 4.5 4.5 14.5M10 4.5l5.5 10M4.5 14.5h11"/><circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="14.5" r="2"/><circle cx="15.5" cy="14.5" r="2"/>'

export const icons = {
  logo: icon(nodes, true),
  people: icon(nodes),
  path: icon('<circle cx="5" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 5h6a3 3 0 0 1 0 6H7a2 2 0 0 0 0 4h6"/>'),
  recent: icon('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2.5"/>'),
  search: icon('<circle cx="8.5" cy="8.5" r="5"/><path d="m12.5 12.5 4.5 4.5"/>'),
  key: icon('<circle cx="6" cy="10" r="3"/><path d="M9 10h8M14.5 10v2.5M17 10v2"/>'),
  close: icon('<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>'),
  add: icon('<path d="M10 4.5v11M4.5 10h11"/>'),
  chevronDown: icon('<path d="m6 8 4 4 4-4"/>'),
  chevronRight: icon('<path d="m8 6 4 4-4 4"/>'),
  settings: icon('<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/><circle cx="10" cy="10" r="5.5"/>'),
  minus: icon('<path d="M4.5 10h11"/>'),
  menu: icon('<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>'),
  sliders: icon('<path d="M3.5 6h6M13.5 6h3M3.5 14h3M10.5 14h6"/><circle cx="11.5" cy="6" r="2"/><circle cx="8.5" cy="14" r="2"/>'),
  fit: icon('<path d="M3.5 7V4.5a1 1 0 0 1 1-1H7M13 3.5h2.5a1 1 0 0 1 1 1V7M16.5 13v2.5a1 1 0 0 1-1 1H13M7 16.5H4.5a1 1 0 0 1-1-1V13"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/>'),
  success: icon('<circle cx="10" cy="10" r="7.5" fill="currentColor"/><path d="m6.8 10.2 2.2 2.2 4.2-4.6" style="stroke: var(--on-accent)"/>'),
  error: icon('<circle cx="10" cy="10" r="7.5" fill="currentColor"/><path d="M10 6.2v4.6M10 13.6v.2" style="stroke: var(--on-accent)"/>'),
  external: icon('<path d="M8.5 4.5h-4v11h11v-4M11.5 3.5h5v5M16.5 3.5 9.5 10.5"/>'),
  // A line with a tick in the middle: the same mark as a mutual connection on the map.
  mutual: icon('<path d="M3.5 10h13M10 6.5v7"/>'),
}
