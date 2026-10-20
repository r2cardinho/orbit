import { beforeEach, describe, expect, it } from 'vitest'
import { GraphModel } from './model.ts'

/** Builds a model with the given people and follows, e.g. [['ana', 'bia']] = ana follows bia. */
function buildModel(logins: string[], follows: [string, string][] = []): GraphModel {
  const model = new GraphModel()
  for (const login of logins) model.addPerson({ login })
  for (const [from, to] of follows) model.addFollow(from, to)
  return model
}

describe('addPerson', () => {
  it('adds a new person, not expanded yet', () => {
    const model = new GraphModel()
    const person = model.addPerson({ login: 'ana', avatarUrl: 'a.png', htmlUrl: 'https://github.com/ana' })

    expect(person).toEqual({ login: 'ana', avatarUrl: 'a.png', htmlUrl: 'https://github.com/ana', expanded: false })
    expect(model.peopleCount).toBe(1)
  })

  it('does not duplicate someone already on the map', () => {
    const model = new GraphModel()
    const first = model.addPerson({ login: 'ana' })
    const second = model.addPerson({ login: 'ana' })

    expect(second).toBe(first)
    expect(model.peopleCount).toBe(1)
  })

  it('treats logins with different case as the same person', () => {
    const model = new GraphModel()
    model.addPerson({ login: 'Ana' })
    model.addPerson({ login: 'ana' })

    expect(model.peopleCount).toBe(1)
    expect(model.getPerson('ANA')?.login).toBe('Ana')
  })

  it('fills missing optional data with null', () => {
    const person = new GraphModel().addPerson({ login: 'ana' })

    expect(person.avatarUrl).toBeNull()
    expect(person.htmlUrl).toBeNull()
  })
})

describe('hasPerson, getPerson and getPeople', () => {
  it('finds people on the map and nobody else', () => {
    const model = buildModel(['ana', 'bia'])

    expect(model.hasPerson('ana')).toBe(true)
    expect(model.hasPerson('caio')).toBe(false)
    expect(model.getPerson('caio')).toBeUndefined()
  })

  it('lists everyone in the order they were added', () => {
    const model = buildModel(['ana', 'bia', 'caio'])

    expect(model.getPeople().map((person) => person.login)).toEqual(['ana', 'bia', 'caio'])
  })
})

describe('clear', () => {
  it('removes people, follows and the center', () => {
    const model = buildModel(['ana', 'bia'], [['ana', 'bia']])
    model.setCenter('ana')
    model.clear()

    expect(model.peopleCount).toBe(0)
    expect(model.linkCount).toBe(0)
    expect(model.getCenter()).toBeNull()
    expect(model.follows('ana', 'bia')).toBe(false)
  })
})

describe('setCenter, getCenter and isCenter', () => {
  it('has no center on a new map', () => {
    expect(new GraphModel().getCenter()).toBeNull()
  })

  it('puts a person at the center, ignoring case', () => {
    const model = buildModel(['Ana', 'bia'])
    model.setCenter('ana')

    expect(model.getCenter()).toBe('Ana')
    expect(model.isCenter('ANA')).toBe(true)
    expect(model.isCenter('bia')).toBe(false)
  })

  it('refuses a center who is not on the map', () => {
    expect(() => new GraphModel().setCenter('ana')).toThrow('"ana" is not on the map.')
  })
})

describe('markExpanded and isExpanded', () => {
  it('marks a person as expanded', () => {
    const model = buildModel(['ana', 'bia'])
    model.markExpanded('ana')

    expect(model.isExpanded('ana')).toBe(true)
    expect(model.isExpanded('bia')).toBe(false)
  })

  it('returns false for someone not on the map', () => {
    expect(new GraphModel().isExpanded('ana')).toBe(false)
  })

  it('refuses to mark someone not on the map', () => {
    expect(() => new GraphModel().markExpanded('ana')).toThrow('"ana" is not on the map.')
  })
})

describe('addFollow and follows', () => {
  it('records who follows whom, in one direction only', () => {
    const model = buildModel(['ana', 'bia'], [['ana', 'bia']])

    expect(model.follows('ana', 'bia')).toBe(true)
    expect(model.follows('bia', 'ana')).toBe(false)
  })

  it('returns true for a new follow and false for a repeated one', () => {
    const model = buildModel(['ana', 'bia'])

    expect(model.addFollow('ana', 'bia')).toBe(true)
    expect(model.addFollow('ana', 'bia')).toBe(false)
    expect(model.linkCount).toBe(1)
  })

  it('ignores someone following themselves', () => {
    const model = buildModel(['ana'])

    expect(model.addFollow('ana', 'ana')).toBe(false)
    expect(model.linkCount).toBe(0)
  })

  it('refuses a follow involving someone not on the map', () => {
    const model = buildModel(['ana'])

    expect(() => model.addFollow('ana', 'bia')).toThrow('"bia" is not on the map.')
  })
})

describe('isMutual', () => {
  it('is true only when both follow each other', () => {
    const model = buildModel(['ana', 'bia', 'caio'], [
      ['ana', 'bia'],
      ['bia', 'ana'],
      ['ana', 'caio'],
    ])

    expect(model.isMutual('ana', 'bia')).toBe(true)
    expect(model.isMutual('bia', 'ana')).toBe(true)
    expect(model.isMutual('ana', 'caio')).toBe(false)
  })
})

describe('getFollowing, getFollowers, getMutuals and getNeighbors', () => {
  let model: GraphModel

  beforeEach(() => {
    // ana ⇄ bia (mutual), ana → caio, davi → ana
    model = buildModel(['ana', 'bia', 'caio', 'davi'], [
      ['ana', 'bia'],
      ['bia', 'ana'],
      ['ana', 'caio'],
      ['davi', 'ana'],
    ])
  })

  it('lists who a person follows', () => {
    expect(model.getFollowing('ana')).toEqual(['bia', 'caio'])
  })

  it('lists who follows a person', () => {
    expect(model.getFollowers('ana')).toEqual(['bia', 'davi'])
  })

  it('lists only the mutual connections', () => {
    expect(model.getMutuals('ana')).toEqual(['bia'])
  })

  it('lists every neighbor once, in either direction', () => {
    expect(model.getNeighbors('ana').sort()).toEqual(['bia', 'caio', 'davi'])
  })

  it('returns empty lists for someone not on the map', () => {
    expect(model.getFollowing('zoe')).toEqual([])
    expect(model.getFollowers('zoe')).toEqual([])
    expect(model.getNeighbors('zoe')).toEqual([])
  })
})

describe('getCommonConnections', () => {
  it('finds people linked to both, in any direction', () => {
    // ana → bia, caio → ana, ana → davi
    // eva → bia, caio ⇄ eva, eva → zoe
    const model = buildModel(['ana', 'eva', 'bia', 'caio', 'davi', 'zoe'], [
      ['ana', 'bia'],
      ['caio', 'ana'],
      ['ana', 'davi'],
      ['eva', 'bia'],
      ['caio', 'eva'],
      ['eva', 'caio'],
      ['eva', 'zoe'],
    ])

    expect(model.getCommonConnections('ana', 'eva').sort()).toEqual(['bia', 'caio'])
  })

  it('never includes the two people themselves', () => {
    // ana ⇄ eva, both follow bia
    const model = buildModel(['ana', 'eva', 'bia'], [
      ['ana', 'eva'],
      ['eva', 'ana'],
      ['ana', 'bia'],
      ['eva', 'bia'],
    ])

    expect(model.getCommonConnections('ana', 'eva')).toEqual(['bia'])
  })

  it('is empty when they share nobody', () => {
    const model = buildModel(['ana', 'eva', 'bia'], [['ana', 'bia']])

    expect(model.getCommonConnections('ana', 'eva')).toEqual([])
  })
})

describe('getLinks, linkCount and mutualCount', () => {
  it('turns a mutual pair into one link and keeps one-way follows as arrows', () => {
    const model = buildModel(['ana', 'bia', 'caio'], [
      ['ana', 'bia'],
      ['bia', 'ana'],
      ['caio', 'ana'],
    ])

    expect(model.getLinks()).toEqual([
      { source: 'ana', target: 'bia', mutual: true },
      { source: 'caio', target: 'ana', mutual: false },
    ])
    expect(model.linkCount).toBe(2)
    expect(model.mutualCount).toBe(1)
  })

  it('is empty for a map without follows', () => {
    const model = buildModel(['ana', 'bia'])

    expect(model.getLinks()).toEqual([])
    expect(model.linkCount).toBe(0)
    expect(model.mutualCount).toBe(0)
  })
})
