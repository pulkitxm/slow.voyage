import { expect, test } from 'bun:test'
import { railAt } from './collision'
import { neutralInput } from './controls'
import { smoothStep } from './field'
import { landscapeIds, landscapeProfiles, passEasing, passLayout } from './landscapes'
import { CarPhysics } from './physics'
import { roadCoordinates, roadLayout, roadPoint } from './road'
import { angleDifference, clamp, defaults, fordDepth, World } from './world'

const cell = 12
const band = 3
const gentle = 0.35
const easy = 0.2
const stretch = 12000
const breadth = 3000
const outing = 600

function openCountry(world: World) {
  const rows = stretch / cell
  const columns = breadth / cell
  const heights = new Float32Array(rows * columns)
  for (let row = 0; row < rows; row++) {
    const s = (row + 0.5) * cell
    const center = world.road(s).x
    for (let column = 0; column < columns; column++)
      heights[row * columns + column] = world.height(
        center + (column + 0.5) * cell - breadth / 2,
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
      const along = row + rowStep
      if (beside < 0 || beside >= columns || along < 0 || along >= rows) continue
      const next = along * columns + beside
      if (seen[next] || !passable(index, next)) continue
      seen[next] = 1
      queue[tail++] = next
    }
  }
  let edges = 0
  let lowest = Number.POSITIVE_INFINITY
  for (const height of heights) lowest = Math.min(lowest, height)
  for (let row = 0; row < rows; row++) {
    if (seen[row * columns]) edges++
    if (seen[row * columns + columns - 1]) edges++
  }
  return { reach: tail / (rows * columns), edges, lowest }
}

test.each(landscapeIds)(
  '%s always has gentle ground leading from the road out into open country',
  (landscape) => {
    for (const [seed, roadMode] of [
      [42, 'winding'],
      [7, 'winding'],
      [90210, 'winding'],
      [42, 'straight'],
      [42, 'calm'],
    ] as const) {
      const country = openCountry(new World({ ...defaults, landscape, seed, roadMode }))
      expect(country.edges).toBeGreaterThan(40)
      expect(country.reach).toBeGreaterThan(0.12)
      expect(country.lowest).toBeGreaterThanOrEqual(fordDepth - 1e-4)
    }
  },
)

test('open landscapes can be crossed almost anywhere', () => {
  for (const landscape of ['highlands', 'desert', 'forest', 'fjord'] as const) {
    const country = openCountry(new World({ ...defaults, landscape }))
    expect(country.reach).toBeGreaterThan(0.75)
    expect(country.edges).toBeGreaterThan(300)
  }
})

test('passes ease the relief smoothly and never repeat', () => {
  expect(passEasing(1234, 0, 42, smoothStep)).toBe(1)
  const spacing = 4000
  let lowest = 1
  let previous = passEasing(0, spacing, 42, smoothStep)
  const centers: number[] = []
  for (let s = 0; s <= spacing * 12; s += 2) {
    const easing = passEasing(s, spacing, 42, smoothStep)
    expect(easing).toBeGreaterThanOrEqual(passLayout.floor - 1e-9)
    expect(easing).toBeLessThanOrEqual(1)
    expect(Math.abs(easing - previous)).toBeLessThan(0.01)
    if (easing < passLayout.floor + 1e-6 && previous >= passLayout.floor + 1e-6) centers.push(s)
    lowest = Math.min(lowest, easing)
    previous = easing
  }
  expect(lowest).toBeCloseTo(passLayout.floor, 6)
  expect(centers.length).toBeGreaterThanOrEqual(11)
  const gaps = centers.slice(1).map((s, index) => s - (centers[index] ?? 0))
  expect(new Set(gaps.map((gap) => Math.round(gap / 20))).size).toBeGreaterThan(3)
  expect(landscapeProfiles.alpine.passSpacing).toBeGreaterThan(0)
  expect(landscapeProfiles.canyon.passSpacing).toBeGreaterThan(0)
})

function plan(world: World, side: number) {
  const rows = stretch / cell
  const columns = breadth / cell
  const middle = columns / 2
  const heights = new Float32Array(rows * columns)
  const gate = new Uint8Array(rows)
  for (let row = 0; row < rows; row++) {
    const s = (row + 0.5) * cell
    const road = world.road(s)
    for (let column = 0; column < columns; column++)
      heights[row * columns + column] = world.height(
        road.x + (column + 0.5) * cell - breadth / 2,
        s,
      )
    let open = !railAt(world, s, side)
    let previous = road.y
    for (let distance = roadLayout.halfWidth + 1; open && distance <= band * cell; distance += 2) {
      const point = roadPoint(road, s, side * distance)
      const height = world.height(point.x, point.s)
      if (Math.abs(height - previous) / 2 > 0.4) open = false
      previous = height
    }
    gate[row] = open ? 1 : 0
  }
  const passable = (from: number, to: number) =>
    Math.abs((heights[to] ?? 0) - (heights[from] ?? 0)) / cell <= easy
  const parent = new Int32Array(rows * columns).fill(-2)
  const queue = new Int32Array(rows * columns)
  let head = 0
  let tail = 0
  const gateColumn = side < 0 ? middle - band - 1 : middle + band
  const goalColumn = middle + side * Math.round(outing / cell)
  for (let row = 0; row < rows; row++)
    if (gate[row]) {
      const index = row * columns + gateColumn
      parent[index] = -1
      queue[tail++] = index
    }
  let arrival = -1
  while (head < tail) {
    const index = queue[head++] ?? 0
    const row = Math.floor(index / columns)
    const column = index - row * columns
    if (column === goalColumn) {
      arrival = index
      break
    }
    for (const [rowStep, columnStep] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const beside = column + columnStep
      const along = row + rowStep
      if (beside < 0 || beside >= columns || along < 0 || along >= rows) continue
      if (beside >= middle - band && beside < middle + band) continue
      const next = along * columns + beside
      if (parent[next] !== -2 || !passable(index, next)) continue
      parent[next] = index
      queue[tail++] = next
    }
  }
  const route: { row: number; column: number }[] = []
  for (let index = arrival; index >= 0; index = parent[index] ?? -1)
    route.unshift({ row: Math.floor(index / columns), column: index % columns })
  return { route, gates: gate.reduce((a, b) => a + b, 0) }
}

test.each([
  ...landscapeIds.map((landscape) => [landscape, 'winding'] as const),
  ['highlands', 'straight'] as const,
  ['canyon', 'straight'] as const,
  ['fjord', 'calm'] as const,
  ['alpine', 'calm'] as const,
])(
  '%s on %s roads lets a pickup leave the road, drive far out into the country and come back',
  (landscape, roadMode) => {
    const settings = { ...defaults, landscape, roadMode, vehicle: 'pickup' as const }
    const world = new World(settings)
    const found = [-1, 1]
      .map((side) => plan(world, side))
      .sort((a, b) => (a.route.length || 1e9) - (b.route.length || 1e9))[0]
    if (!found) throw new Error('No side was planned')
    expect(found.route.length).toBeGreaterThan(40)
    const out = found.route.map((step) => {
      const s = (step.row + 0.5) * cell
      return { x: world.road(s).x + (step.column + 0.5) * cell - breadth / 2, s }
    })
    const first = out[0]
    if (!first) throw new Error('Route is empty')
    const points = [...out, ...out.slice(0, -1).reverse(), { x: world.road(first.s).x, s: first.s }]
    const car = new CarPhysics(world)
    car.reset(first.s)
    car.x = first.x
    const heading = points[4] ?? first
    car.yaw = Math.atan2(-(heading.x - first.x), heading.s - first.s)
    car.suspension.reset(car)
    let target = 0
    let farthest = 0
    let arrived = false
    for (let step = 0; step < 900 * 120 && !arrived; step++) {
      while (
        target < points.length - 1 &&
        Math.hypot((points[target]?.x ?? 0) - car.x, (points[target]?.s ?? 0) - car.s) < 22
      )
        target++
      const goal = points[target] ?? first
      const error = angleDifference(Math.atan2(-(goal.x - car.x), goal.s - car.s), car.yaw)
      const pace = Math.abs(error) > 0.5 ? 6 : 13
      car.update(
        1 / 120,
        {
          ...neutralInput,
          throttle: car.speed < pace ? 1 : 0,
          brake: car.speed > pace + 3 ? 0.4 : 0,
          steer: clamp(error * 2.2, -1, 1),
          steeringSource: 'analog',
        },
        settings,
      )
      const distance = Math.abs(roadCoordinates(world, car.x, car.s).distance)
      farthest = Math.max(farthest, distance)
      arrived = farthest > outing - 60 && distance < roadLayout.halfWidth
    }
    expect(arrived).toBe(true)
    expect(car.hits).toBe(0)
  },
  900000,
)
