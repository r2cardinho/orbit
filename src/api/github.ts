// Calls to the public GitHub REST API: profile, followers and following.
//
// - Lists come in pages (`per_page` people per request, `page` chooses which slice).
// - Every response carries the rate limit headers, which are kept in `rateLimit`.
// - Responses are cached (see cache.ts) so the same data never costs two requests.
// - The optional personal token lives only in this module's memory.

import { strings } from '../ui/strings.ts'
import { readCache, writeCache } from './cache.ts'

const API_URL = 'https://api.github.com'
const MAX_PER_PAGE = 100 // the largest page GitHub allows
export const DEFAULT_PER_PAGE = 20

// GitHub logins: letters, numbers and single hyphens, up to 39 characters.
const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

// ---------- Public types ----------

export interface GitHubProfile {
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
  bio: string | null
  company: string | null
  location: string | null
  followers: number
  following: number
  publicRepos: number
}

/** A person as they appear inside a followers or following list. */
export interface GitHubUser {
  login: string
  avatarUrl: string
  htmlUrl: string
}

/** One page of a followers or following list. */
export interface UserPage {
  users: GitHubUser[]
  page: number
  hasNextPage: boolean
}

export interface RateLimit {
  limit: number
  remaining: number
  resetAt: Date
}

export type GitHubErrorKind = 'not-found' | 'bad-token' | 'rate-limit' | 'network' | 'unexpected'

/** Error with a `kind` the interface can react to and a message that says how to fix it. */
export class GitHubError extends Error {
  readonly kind: GitHubErrorKind
  readonly resetAt: Date | null

  constructor(kind: GitHubErrorKind, message: string, resetAt: Date | null = null) {
    super(message)
    this.name = 'GitHubError'
    this.kind = kind
    this.resetAt = resetAt
  }
}

// ---------- Token (memory only) ----------

let token: string | null = null

/** Sets the personal token, or removes it with `null`. It is never saved anywhere. */
export function setToken(value: string | null): void {
  const trimmed = value?.trim() ?? ''
  token = trimmed === '' ? null : trimmed
}

export function hasToken(): boolean {
  return token !== null
}

// ---------- Rate limit ----------

let rateLimit: RateLimit | null = null
const rateLimitListeners: ((rateLimit: RateLimit) => void)[] = []

/** The rate limit from the last response, or `null` before the first request. */
export function getRateLimit(): RateLimit | null {
  return rateLimit
}

/** Calls `listener` every time a response brings new rate limit numbers. */
export function onRateLimitChange(listener: (rateLimit: RateLimit) => void): void {
  rateLimitListeners.push(listener)
}

function readRateLimit(headers: Headers): void {
  const limit = headers.get('x-ratelimit-limit')
  const remaining = headers.get('x-ratelimit-remaining')
  const reset = headers.get('x-ratelimit-reset')
  if (limit === null || remaining === null || reset === null) return

  rateLimit = {
    limit: Number(limit),
    remaining: Number(remaining),
    resetAt: new Date(Number(reset) * 1000), // GitHub sends seconds, Date wants milliseconds
  }
  for (const listener of rateLimitListeners) listener(rateLimit)
}

// ---------- Requests ----------

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token !== null) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * Asks GitHub how many requests are left, so the status bar has numbers even when
 * everything came from the cache. This call does not count against the limit.
 */
export async function refreshRateLimit(): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/rate_limit`, { headers: requestHeaders() })
    readRateLimit(response.headers)
  } catch {
    // Offline: the numbers will come with the next request that works.
  }
}

/**
 * Checks a token with GitHub and, if it works, starts using it.
 * The check uses /rate_limit, which costs nothing and also brings the new limit (5,000).
 * Throws a GitHubError ("bad-token", "network"…) when the token cannot be used.
 */
export async function addToken(value: string): Promise<void> {
  const candidate = value.trim()
  let response: Response
  try {
    response = await fetch(`${API_URL}/rate_limit`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${candidate}` },
    })
  } catch {
    throw new GitHubError('network', strings.errors.network)
  }
  if (response.status === 401) throw new GitHubError('bad-token', strings.errors.badToken)
  if (!response.ok) throw new GitHubError('unexpected', strings.errors.unexpected(response.status))

  setToken(candidate)
  readRateLimit(response.headers)
}

/** Stops using the token and fetches the limit without it again (back to 60). */
export async function removeToken(): Promise<void> {
  setToken(null)
  await refreshRateLimit()
}

/** Fetches `path` from the API and turns any failure into a `GitHubError`. */
async function request(path: string, login: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(API_URL + path, { headers: requestHeaders() })
  } catch {
    throw new GitHubError('network', strings.errors.network)
  }

  readRateLimit(response.headers)
  if (!response.ok) throw errorFromResponse(response, login)
  return response
}

function errorFromResponse(response: Response, login: string): GitHubError {
  switch (response.status) {
    case 404:
      return notFoundError(login)
    case 401:
      return new GitHubError('bad-token', strings.errors.badToken)
    case 403:
    case 429: {
      const resetAt = rateLimitResetTime(response.headers)
      return new GitHubError('rate-limit', strings.errors.rateLimit(resetAt, hasToken()), resetAt)
    }
    default:
      return new GitHubError('unexpected', strings.errors.unexpected(response.status))
  }
}

function notFoundError(login: string): GitHubError {
  return new GitHubError('not-found', strings.errors.notFound(login))
}

/**
 * When the requests can be made again.
 * - `retry-after` (seconds to wait) comes with GitHub's short "slow down" limits.
 * - Otherwise, if the hourly limit is used up, `x-ratelimit-reset` says when it refills.
 * - If neither applies, waiting one minute is GitHub's own advice.
 */
function rateLimitResetTime(headers: Headers): Date {
  const retryAfter = headers.get('retry-after')
  if (retryAfter !== null) return new Date(Date.now() + Number(retryAfter) * 1000)

  if (rateLimit !== null && rateLimit.remaining === 0) return rateLimit.resetAt

  return new Date(Date.now() + 60 * 1000)
}

function checkLogin(login: string): void {
  // An invalid login can never exist, so there is no reason to spend a request on it.
  if (!LOGIN_PATTERN.test(login)) throw notFoundError(login)
}

// ---------- Conversion from the API format (snake_case) ----------

interface RawProfile {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  company: string | null
  location: string | null
  followers: number
  following: number
  public_repos: number
}

interface RawUser {
  login: string
  avatar_url: string
  html_url: string
}

function toProfile(raw: RawProfile): GitHubProfile {
  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
    bio: raw.bio,
    company: raw.company,
    location: raw.location,
    followers: raw.followers,
    following: raw.following,
    publicRepos: raw.public_repos,
  }
}

function toUser(raw: RawUser): GitHubUser {
  return { login: raw.login, avatarUrl: raw.avatar_url, htmlUrl: raw.html_url }
}

// ---------- Public functions ----------

export async function getProfile(login: string): Promise<GitHubProfile> {
  checkLogin(login)
  const cacheKey = `profile:${login.toLowerCase()}`
  const cached = readCache<GitHubProfile>(cacheKey)
  if (cached !== undefined) return cached

  const response = await request(`/users/${encodeURIComponent(login)}`, login)
  const profile = toProfile((await response.json()) as RawProfile)
  writeCache(cacheKey, profile)
  return profile
}

/** People who follow `login`. `page` starts at 1. */
export function getFollowers(login: string, page = 1, perPage = DEFAULT_PER_PAGE): Promise<UserPage> {
  return getUserPage(login, 'followers', page, perPage)
}

/** People `login` follows. `page` starts at 1. */
export function getFollowing(login: string, page = 1, perPage = DEFAULT_PER_PAGE): Promise<UserPage> {
  return getUserPage(login, 'following', page, perPage)
}

async function getUserPage(
  login: string,
  list: 'followers' | 'following',
  page: number,
  perPage: number,
): Promise<UserPage> {
  checkLogin(login)
  const size = Math.min(Math.max(Math.floor(perPage), 1), MAX_PER_PAGE)
  const cacheKey = `${list}:${login.toLowerCase()}:${size}:${page}`
  const cached = readCache<UserPage>(cacheKey)
  if (cached !== undefined) return cached

  const path = `/users/${encodeURIComponent(login)}/${list}?per_page=${size}&page=${page}`
  const response = await request(path, login)
  const users = ((await response.json()) as RawUser[]).map(toUser)

  // The "link" header points to the next page only when there is one.
  const hasNextPage = response.headers.get('link')?.includes('rel="next"') ?? false

  const result: UserPage = { users, page, hasNextPage }
  writeCache(cacheKey, result)
  return result
}
