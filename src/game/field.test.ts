import { expect, test } from 'bun:test'
import { roadCurve, terrainField } from './field'

test('terrain is deterministic regardless of query order and changes with the seed', () => {
  const points = [
    [-1300, -2300],
    [-1, 500],
    [0, 0],
    [120, 240],
    [1600, 4000],
    [100000, 500000],
  ] as const
  const first = points.map(([x, s]) => terrainField(x, s, 42))
  const reverse = [...points]
    .reverse()
    .map(([x, s]) => terrainField(x, s, 42))
    .reverse()
  expect(reverse).toEqual(first)
  expect(points.map(([x, s]) => terrainField(x, s, 43))).not.toEqual(first)
})

test('terrain heights and gradients join continuously across control-cell boundaries', () => {
  const epsilon = 0.001
  for (const x of [-1500, -1000, -250, 0, 250, 1000, 1500]) {
    for (const s of [-500, 0, 500, 1500]) {
      const height = (offset: number) => terrainField(x + offset, s, 42)
      const left = (height(0) - height(-epsilon)) / epsilon
      const right = (height(epsilon) - height(0)) / epsilon
      expect(Math.abs(height(epsilon) - height(-epsilon))).toBeLessThan(0.01)
      expect(Math.abs(left - right)).toBeLessThan(0.001)
    }
  }
})

test('road control curves have continuous slopes at negative and positive boundaries', () => {
  for (const length of [180, 450, 1200]) {
    for (const cell of [-3, -1, 0, 1, 3, 1000]) {
      const s = cell * length
      const before = roadCurve(s - 0.001, length, 42),
        after = roadCurve(s + 0.001, length, 42)
      expect(Math.abs(before.value - after.value)).toBeLessThan(0.001)
      expect(Math.abs(before.derivative - after.derivative)).toBeLessThan(0.00001)
    }
  }
})

test('road control slopes agree with a finite-difference measurement', () => {
  for (const s of [-853, 42, 381, 1356, 123456]) {
    const epsilon = 0.01
    const measured =
      (roadCurve(s + epsilon, 450, 42).value - roadCurve(s - epsilon, 450, 42).value) /
      (2 * epsilon)
    expect(roadCurve(s, 450, 42).derivative).toBeCloseTo(measured, 8)
  }
})
