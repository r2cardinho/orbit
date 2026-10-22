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
    editToken: 'Edit token',
    menu: 'People on this map',
    settings: 'Map settings',
  },

  ribbon: {
    label: 'Views',
    people: 'People on this map',
    path: 'Path between two people',
    recentMaps: 'Recent maps',
    settings: 'Map settings',
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

  // Notices at the top of the map. The title is bold and the detail follows it.
  notices: {
    close: 'Close notice',
    loadingMap: (login: string) => `Loading ${login}…`,
    loadingConnections: (login: string) => `Loading connections of ${login}…`,
    expanded: (login: string) => `${login} expanded.`,
    newPeople: (value: number) =>
      value === 0 ? 'No new people: everyone was already on the map.' : `${count(value, 'new person', 'new people')} on the map.`,
    couldNotLoad: (login: string) => `Could not load ${login}.`,
    tokenAdded: 'Token added.',
    tokenAddedDetail: 'You now have 5,000 requests per hour.',
    tokenRemoved: 'Token removed.',
    tokenRemovedDetail: 'Back to 60 requests per hour.',
  },

  settings: {
    title: 'Map settings',
    close: 'Close map settings',
    filters: 'Filters',
    mutualOnly: 'Mutual only',
    showNotExpanded: 'Show not expanded',
    display: 'Display',
    nodeSize: 'Node size',
    spacing: 'Spacing',
    requests: 'GitHub requests',
    perClick: 'Per click',
    perClickHint: 'People loaded from each list (followers and following) on every click.',
    token: 'GitHub token',
    sound: 'Sound',
    sounds: 'Sounds',
    soundsHint: 'Soft sounds when people appear, when a connection turns mutual and when something goes wrong.',
    percent: (value: number) => `${value}%`,
  },

  legend: {
    label: 'Legend',
    center: 'Center',
    expanded: 'Expanded',
    notExpanded: 'Not expanded',
    follows: 'Follows',
    mutual: 'Mutual',
    inCommon: 'In common',
  },

  zoom: {
    label: 'Zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    level: (percent: number) => `${percent}%`,
    fit: 'Show the whole map',
  },

  tokenDialog: {
    title: 'Add a GitHub token',
    intro: 'Without a token, GitHub allows 60 requests per hour. A token raises the limit to 5,000.',
    howTo: 'How to create one',
    steps: [
      'On GitHub, open your profile picture menu and choose Settings.',
      'Go to Developer settings › Personal access tokens › Fine-grained tokens.',
      'Choose Generate new token, give it a name and pick an expiration.',
      'Under Repository access, keep Public repositories. Do not add any permissions.',
      'Generate the token and copy it.',
    ],
    createLink: 'Open the token page on GitHub',
    source: 'Source:',
    sourceLink: 'GitHub Docs, Managing your personal access tokens',
    newTab: '(opens in a new tab)',
    fieldLabel: 'Token',
    fieldPlaceholder: 'github_pat_…',
    privacy: 'The token stays only in this page’s memory. It is never saved, it disappears when you reload, and it is only sent to the GitHub API.',
    save: 'Save token',
    checking: 'Checking token…',
    remove: 'Remove token',
    cancel: 'Cancel',
    empty: 'Paste a token first.',
    active: 'A token is active. You have 5,000 requests per hour.',
  },

  links: {
    createToken: 'https://github.com/settings/personal-access-tokens/new',
    tokenDocs: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  },

  // Joins names as "a, b and c".
  list: {
    separator: ', ',
    lastSeparator: ' and ',
  },

  peopleList: {
    title: 'People on this map',
    filterLabel: 'Filter people',
    center: 'Center',
    expanded: 'Expanded',
    notExpanded: 'Not expanded',
    groupWithCount: (name: string, value: number) => `${name} (${formatNumber(value)})`,
    showMore: (value: number) => `Show ${formatNumber(value)} more`,
    empty: 'People appear here once a map starts.',
    noMatches: (filter: string) => `No one on this map matches "${filter}".`,
  },

  profile: {
    label: 'Selected person',
    empty: 'Select someone on the map to see their profile.',
    onGitHub: (login: string) => `@${login} on GitHub`,
    stats: (followers: number, following: number, repositories: number) =>
      `${count(followers, 'follower', 'followers')}, ${formatNumber(following)} following, ` +
      `${count(repositories, 'repository', 'repositories')}.`,
    loadingProfile: 'Loading profile…',
    loadMore: (perClick: number) => `Load ${formatNumber(perClick)} more`,
    loading: 'Loading…',
    allLoaded: 'All loaded',
    startMap: 'Start map here',
    startMapShort: 'Start here',
    onThisMap: 'On this map: ',
    followsCount: (value: number) => `follows ${formatNumber(value)}`,
    followedByCount: (value: number) => `followed by ${formatNumber(value)}`,
    mutualCount: (value: number) => `${formatNumber(value)} mutual`,
    expand: 'Show more of the profile',
    collapse: 'Show less of the profile',
    followsOnMap: 'Follows on this map',
    followedBy: 'Followed by',
    mutual: 'Mutual',
    inCommonWith: (center: string) => `In common with ${center}: `,
    nothingInCommon: (center: string) => `Nothing in common with ${center} on this map yet.`,
    connections: (value: number) => `Connections on this map (${formatNumber(value)})`,
    noConnections: 'No connections on this map yet.',
    relationMutual: 'mutual',
    relationFollows: (login: string) => `${login} follows`,
    relationFollowedBy: (login: string) => `follows ${login}`,
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
