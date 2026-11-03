import { expect, test } from 'bun:test'
import { adjustCruiseSpeed } from './cruise'

test.each(['km', 'mi'] as const)(
  'cruise adjustments pause at zero before changing direction in %s',
  (units) => {
    for (const sign of [-1, 1]) {
      const stopped = adjustCruiseSpeed(sign * 0.1, -sign, units)
      expect(stopped).toBe(0)
      expect(Math.sign(adjustCruiseSpeed(stopped, -sign, units))).toBe(-sign)
    }
  },
)

test('cruise adjustments use display units and retain physical speed limits', () => {
  expect(adjustCruiseSpeed(10, 1, 'km')).toBeCloseTo(10 + 5 / 3.6, 8)
  expect(adjustCruiseSpeed(10, -1, 'mi')).toBeCloseTo(10 - 5 / 2.23694, 8)
  expect(adjustCruiseSpeed(44.9, 1, 'km')).toBe(45)
  expect(adjustCruiseSpeed(-4.9, -1, 'mi')).toBe(-5)
})
