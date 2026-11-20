import { expect, test } from 'bun:test'
import { wakeLayout, wakeStrength } from './wake'

test('spray rises only on a wet road and builds with speed', () => {
  expect(wakeStrength(30, false, true, 0)).toBe(0)
  expect(wakeStrength(30, true, false, 0)).toBe(0)
  expect(wakeStrength(wakeLayout.startSpeed - 1, true, true, 1)).toBe(0)
  const slow = wakeStrength(12, true, true, 0)
  const fast = wakeStrength(28, true, true, 0)
  expect(slow).toBeGreaterThan(0)
  expect(fast).toBeGreaterThan(slow)
  expect(wakeStrength(-28, true, true, 0)).toBeCloseTo(fast, 6)
})

test('a puddle throws more spray, never more than full strength', () => {
  const film = wakeStrength(25, true, true, 0)
  const pool = wakeStrength(25, true, true, 1)
  expect(pool).toBeGreaterThan(film)
  expect(wakeStrength(80, true, true, 1)).toBeLessThanOrEqual(1)
})
