// Every text shown in the interface lives here, in US English and sentence case.
// Data from GitHub (names, logins, bios) is never translated or changed.

/** "1,234" */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

/** "4:40 PM" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Time left as a stopwatch: "42:07", or "1:02:07" from one hour up. */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const twoDigits = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}` : `${minutes}:${twoDigits(seconds)}`
}

/** "1 person" / "18 people" */
function count(value: number, singular: string, plural: string): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`
}

export const strings = {
  appName: 'Orbit',
  comingSoon: 'Coming soon',

  topbar: {
    searchLabel: 'GitHub username',
    searchPlaceholder: 'GitHub username',
    searchSubmit: 'Map',
    addToken: 'Add token',
  },

  ribbon: {
    label: 'Views',
    people: 'People on this map',
    path: 'Path between two people',
    recentMaps: 'Recent maps',
  },

  tabs: {
    label: 'Open maps',
    newMap: 'New map',
    newTab: 'New tab',
    close: (name: string) => `Close ${name}`,
  },

  graph: {
    label: 'Map of GitHub connections',
    empty: 'Enter a GitHub username to start a map.',
  },

  statusbar: {
    label: 'Map totals',
    people: (value: number) => count(value, 'person', 'people'),
    connections: (value: number) => count(value, 'connection', 'connections'),
    mutual: (value: number) => `${formatNumber(value)} mutual`,
    requestsLeft: (remaining: number, limit: number) =>
      `${formatNumber(remaining)} of ${formatNumber(limit)} requests left this hour`,
    resetsIn: (countdown: string) => `Resets in ${countdown}`,
    resetsAt: (date: Date) => `At ${formatTime(date)}`,
    resetNow: 'Requests refilled. Updating…',
    full: 'All requests available',
    fullHint: 'The hour starts with your next request',
  },

  errors: {
    notFound: (login: string) => `GitHub user "${login}" not found. Check the spelling and try again.`,
    badToken: 'GitHub rejected the token. Check that it was copied correctly, or remove it to continue without one.',
    rateLimit: (resetAt: Date, hasToken: boolean) =>
      `GitHub rate limit reached. Resets at ${formatTime(resetAt)}.` +
      (hasToken ? '' : ' Add a token to raise the limit to 5,000 requests per hour.'),
    network: 'Could not reach GitHub. Check your internet connection and try again.',
    unexpected: (status: number) => `GitHub returned an unexpected error (${status}). Try again in a moment.`,
  },
}
