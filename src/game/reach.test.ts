import { expect, test } from 'bun:test'
import { smoothStep, worldLoop } from './field'
import { landscapeIds, landscapeProfiles, passEasing, passLayout } from './landscapes'
import { defaults, fordDepth, World } from './world'

const cell = 12
const gentle = 0.35

function drivableLoop(world: World) {
  const rows = worldLoop.length / cell
  const columns = worldLoop.width / cell
  const heights = new Float32Array(rows * columns)
  for (let row = 0; row < rows; row++) {
    const s = (row + 0.5) * cell
    const center = world.road(s).x
    for (let column = 0; column < columns; column++)
      heights[row * columns + column] = world.height(
        center + (column + 0.5) * cell - worldLoop.width / 2,
        s,
      )
  }
  const passable = (from: number, to: number) =>
    Math.abs((heights[to] ?? 0) - (heights[from] ?? 0)) / cell <= gentle
  const seen = new Uint8Array(rows * columns)
  const queue = new Int32Array(rows * columns)
  let head = 0
  let tail = 0
  for (let row = 0; row < rows; row++)
    for (const column of [columns / 2 - 1, columns / 2]) {
      seen[row * columns + column] = 1
      queue[tail++] = row * columns + column
    }
  while (head < tail) {
    const index = queue[head++] ?? 0
    const row = Math.floor(index / columns)
    const column = index - row * columns
    for (const [rowStep, columnStep] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const beside = column + columnStep
      if (beside < 0 || beside >= columns) continue
      const next = ((row + rowStep + rows) % rows) * columns + beside
      if (seen[next] || !passable(index, next)) continue
      seen[next] = 1
      queue[tail++] = next
    }
  }
  let crossings = 0
  let lowest = Number.POSITIVE_INFINITY
  for (const height of heights) lowest = Math.min(lowest, height)
  for (let row = 0; row < rows; row++) {
    const left = row * columns
    const right = left + columns - 1
    if (seen[left] && seen[right] && passable(left, right)) crossings++
  }
  return { reach: tail / (rows * columns), crossings, lowest }
}

test.each(landscapeIds)(
  '%s always has a gentle route from the road, around the world and back',
  (landscape) => {
    for (const seed of [42, 7, 90210]) {
      const loop = drivableLoop(new World({ ...defaults, landscape, seed }))
      expect(loop.crossings).toBeGreaterThan(40)
      expect(loop.reach).toBeGreaterThan(0.12)
      expect(loop.lowest).toBeGreaterThanOrEqual(fordDepth - 1e-4)
    }
  },
)

test('open landscapes can be crossed almost anywhere', () => {
  for (const landscape of ['highlands', 'desert', 'forest', 'fjord'] as const) {
    const loop = drivableLoop(new World({ ...defaults, landscape }))
    expect(loop.reach).toBeGreaterThan(0.75)
    expect(loop.crossings).toBeGreaterThan(300)
  }
})

test('passes ease the relief smoothly and repeat every lap', () => {
  expect(passEasing(1234, worldLoop.length, 0, 42, smoothStep)).toBe(1)
  let lowest = 1
  let previous = passEasing(0, worldLoop.length, 3, 42, smoothStep)
  for (let s = 0; s <= worldLoop.length; s += 2) {
    const easing = passEasing(s, worldLoop.length, 3, 42, smoothStep)
    expect(easing).toBeGreaterThanOrEqual(passLayout.floor - 1e-9)
    expect(easing).toBeLessThanOrEqual(1)
    expect(Math.abs(easing - previous)).toBeLessThan(0.01)
    expect(passEasing(s + worldLoop.length * 2, worldLoop.length, 3, 42, smoothStep)).toBeCloseTo(
      easing,
      9,
    )
    lowest = Math.min(lowest, easing)
    previous = easing
  }
  expect(lowest).toBeCloseTo(passLayout.floor, 6)
  expect(landscapeProfiles.alpine.passes).toBeGreaterThan(0)
  expect(landscapeProfiles.canyon.passes).toBeGreaterThan(0)
})
