import { describe, expect, it } from 'vitest'
import { formatCountdown } from './strings.ts'

describe('formatCountdown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCountdown((42 * 60 + 7) * 1000)).toBe('42:07')
  })

  it('rounds a partial second up, so it never shows 0:00 too early', () => {
    expect(formatCountdown(200)).toBe('0:01')
  })

  it('adds hours from one hour up', () => {
    expect(formatCountdown((3600 + 2 * 60 + 7) * 1000)).toBe('1:02:07')
  })
})
