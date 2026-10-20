// The map in memory: who is on it and who follows whom.
//
// This file knows nothing about the screen or the API. It only answers questions
// like "does A follow B?", "are they mutual?" and "who do they both know?".
//
// Data structures:
// - `people`    Map from key to Person, so finding someone is instant and nobody is added twice.
// - `following` Map from key to the Set of keys that person follows (arrows going out).
// - `followers` Map from key to the Set of keys that follow that person (arrows coming in).
//   Keeping both directions costs a little memory but makes every question a quick lookup.
//
// GitHub logins ignore case ("Torvalds" and "torvalds" are the same account), so keys
// are lowercase. The `login` saved in Person keeps the spelling that came from GitHub.

export interface Person {
  login: string
  avatarUrl: string | null
  htmlUrl: string | null
  /** True once this person's followers and following were fetched. */
  expanded: boolean
}

/** The data needed to add someone. Extra fields (like those from the API) are ignored. */
export interface PersonInput {
  login: string
  avatarUrl?: string | null
  htmlUrl?: string | null
}

/**
 * A line on the map between two people.
 * - Not mutual: `source` follows `target` (drawn as an arrow).
 * - Mutual: they follow each other and the pair appears only once.
 */
export interface Link {
  source: string
  target: string
  mutual: boolean
}

function keyOf(login: string): string {
  return login.toLowerCase()
}

export class GraphModel {
  private readonly people = new Map<string, Person>()
  private readonly following = new Map<string, Set<string>>()
  private readonly followers = new Map<string, Set<string>>()

  // ---------- People ----------

  /** Adds a person, or returns the one already on the map with the same login. */
  addPerson(input: PersonInput): Person {
    const key = keyOf(input.login)
    const existing = this.people.get(key)
    if (existing !== undefined) return existing

    const person: Person = {
      login: input.login,
      avatarUrl: input.avatarUrl ?? null,
      htmlUrl: input.htmlUrl ?? null,
      expanded: false,
    }
    this.people.set(key, person)
    this.following.set(key, new Set())
    this.followers.set(key, new Set())
    return person
  }

  hasPerson(login: string): boolean {
    return this.people.has(keyOf(login))
  }

  getPerson(login: string): Person | undefined {
    return this.people.get(keyOf(login))
  }

  /** Everyone on the map, in the order they were added. */
  getPeople(): Person[] {
    return [...this.people.values()]
  }

  get peopleCount(): number {
    return this.people.size
  }

  // ---------- Expanded ----------

  markExpanded(login: string): void {
    this.requirePerson(login).expanded = true
  }

  isExpanded(login: string): boolean {
    return this.getPerson(login)?.expanded ?? false
  }

  // ---------- Follows ----------

  /**
   * Records that `from` follows `to`. Both must already be on the map.
   * Returns false if the link was already known or if it is someone following themselves.
   */
  addFollow(from: string, to: string): boolean {
    this.requirePerson(from)
    this.requirePerson(to)
    const fromKey = keyOf(from)
    const toKey = keyOf(to)
    if (fromKey === toKey) return false

    const outgoing = this.following.get(fromKey)!
    if (outgoing.has(toKey)) return false

    outgoing.add(toKey)
    this.followers.get(toKey)!.add(fromKey)
    return true
  }

  /** Does `from` follow `to`? */
  follows(from: string, to: string): boolean {
    return this.following.get(keyOf(from))?.has(keyOf(to)) ?? false
  }

  isMutual(a: string, b: string): boolean {
    return this.follows(a, b) && this.follows(b, a)
  }

  /** People on the map that `login` follows. */
  getFollowing(login: string): string[] {
    return this.loginsOf(this.following.get(keyOf(login)))
  }

  /** People on the map who follow `login`. */
  getFollowers(login: string): string[] {
    return this.loginsOf(this.followers.get(keyOf(login)))
  }

  /** People on the map who follow `login` and are followed back. */
  getMutuals(login: string): string[] {
    return this.getFollowing(login).filter((other) => this.follows(other, login))
  }

  /** Everyone linked to `login` in either direction. */
  getNeighbors(login: string): string[] {
    return this.loginsOf(this.neighborKeys(keyOf(login)))
  }

  /**
   * People linked (in either direction) to both `a` and `b`.
   * Used for "In common with": the people two users both know.
   */
  getCommonConnections(a: string, b: string): string[] {
    const keyA = keyOf(a)
    const keyB = keyOf(b)
    const neighborsOfB = this.neighborKeys(keyB)

    const common = new Set<string>()
    for (const key of this.neighborKeys(keyA)) {
      if (neighborsOfB.has(key) && key !== keyA && key !== keyB) common.add(key)
    }
    return this.loginsOf(common)
  }

  // ---------- Links ----------

  /** Every line of the map. A mutual pair becomes a single link. */
  getLinks(): Link[] {
    const links: Link[] = []
    for (const [fromKey, targets] of this.following) {
      for (const toKey of targets) {
        const mutual = this.following.get(toKey)!.has(fromKey)
        // A mutual pair is seen twice (A→B and B→A); keep only the first, in key order.
        if (mutual && fromKey > toKey) continue
        links.push({
          source: this.people.get(fromKey)!.login,
          target: this.people.get(toKey)!.login,
          mutual,
        })
      }
    }
    return links
  }

  /** Number of lines on the map (a mutual pair counts once). */
  get linkCount(): number {
    return this.getLinks().length
  }

  /** Number of mutual pairs on the map. */
  get mutualCount(): number {
    return this.getLinks().filter((link) => link.mutual).length
  }

  // ---------- Helpers ----------

  private requirePerson(login: string): Person {
    const person = this.getPerson(login)
    if (person === undefined) throw new Error(`"${login}" is not on the map.`)
    return person
  }

  private neighborKeys(key: string): Set<string> {
    const outgoing = this.following.get(key) ?? new Set<string>()
    const incoming = this.followers.get(key) ?? new Set<string>()
    return new Set([...outgoing, ...incoming])
  }

  private loginsOf(keys: Set<string> | undefined): string[] {
    if (keys === undefined) return []
    return [...keys].map((key) => this.people.get(key)!.login)
  }
}
