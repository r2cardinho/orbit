// Browser cache for GitHub responses that were already received.
//
// Every request costs one of the hourly requests GitHub allows, so data that was
// already fetched is saved in localStorage and reused. Each entry expires after
// a while so profiles and lists do not stay outdated forever.
//
// Only public data is stored here. The token is never cached.

const KEY_PREFIX = 'orbit:cache:'
const TIME_TO_LIVE_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry<T> {
  savedAt: number
  value: T
}

/** Returns the saved value for `key`, or `undefined` if it is missing or expired. */
export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key)
    if (raw === null) return undefined

    const entry = JSON.parse(raw) as CacheEntry<T>
    if (Date.now() - entry.savedAt > TIME_TO_LIVE_MS) {
      localStorage.removeItem(KEY_PREFIX + key)
      return undefined
    }
    return entry.value
  } catch {
    // Storage blocked (private window) or corrupted entry: behave as a cache miss.
    return undefined
  }
}

/** Saves `value` under `key`. Fails silently if the browser does not allow storage. */
export function writeCache<T>(key: string, value: T): void {
  const entry: CacheEntry<T> = { savedAt: Date.now(), value }
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Storage full or blocked: the app still works, it just fetches again next time.
  }
}

/** Removes every entry saved by Orbit. */
export function clearCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(KEY_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
