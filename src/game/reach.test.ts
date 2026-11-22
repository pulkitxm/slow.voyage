import { expect, test } from 'bun:test'
import { railAt } from './collision'
import { neutralInput } from './controls'
import { smoothStep, worldLoop } from './field'
import { landscapeIds, landscapeProfiles, passEasing, passLayout } from './landscapes'
import { CarPhysics } from './physics'
import { roadCoordinates, roadLayout, roadPoint } from './road'
import { angleDifference, clamp, defaults, fordDepth, World } from './world'

const cell = 12
const band = 3
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

function plan(world: World) {
  const rows = worldLoop.length / cell
  const columns = worldLoop.width / cell
  const middle = columns / 2
  const heights = new Float32Array(rows * columns)
  const gate = [new Uint8Array(rows), new Uint8Array(rows)]
  for (let row = 0; row < rows; row++) {
    const s = (row + 0.5) * cell
    const road = world.road(s)
    for (let column = 0; column < columns; column++)
      heights[row * columns + column] = world.height(
        road.x + (column + 0.5) * cell - worldLoop.width / 2,
        s,
      )
    for (const [index, side] of [-1, 1].entries()) {
      let open = !railAt(world, s, side)
      let previous = road.y
      for (
        let distance = roadLayout.halfWidth + 1;
        open && distance <= band * cell;
        distance += 2
      ) {
        const point = roadPoint(road, s, side * distance)
        const height = world.height(point.x, point.s)
        if (Math.abs(height - previous) / 2 > 0.4) open = false
        previous = height
      }
      const gateRow = gate[index]
      if (gateRow) gateRow[row] = open ? 1 : 0
    }
  }
  const passable = (from: number, to: number) =>
    Math.abs((heights[to] ?? 0) - (heights[from] ?? 0)) / cell <= gentle
  const parent = new Int32Array(rows * columns).fill(-2)
  const queue = new Int32Array(rows * columns)
  let head = 0
  let tail = 0
  const leftColumn = middle - band - 1
  const rightColumn = middle + band
  for (let row = 0; row < rows; row++)
    if (gate[0]?.[row]) {
      const index = row * columns + leftColumn
      parent[index] = -1
      queue[tail++] = index
    }
  let arrival = -1
  while (head < tail) {
    const index = queue[head++] ?? 0
    const row = Math.floor(index / columns)
    const column = index - row * columns
    if (column === rightColumn && gate[1]?.[row]) {
      arrival = index
      break
    }
    for (const [rowStep, columnStep] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const beside = (column + columnStep + columns) % columns
      if (beside >= middle - band && beside < middle + band) continue
      const next = ((row + rowStep + rows) % rows) * columns + beside
      if (parent[next] !== -2 || !passable(index, next)) continue
      parent[next] = index
      queue[tail++] = next
    }
  }
  const route: { row: number; column: number }[] = []
  for (let index = arrival; index >= 0; index = parent[index] ?? -1)
    route.unshift({ row: Math.floor(index / columns), column: index % columns })
  return { route, rows, columns, gates: gate.map((g) => g.reduce((a, b) => a + b, 0)) }
}

test.each(landscapeIds)(
  '%s lets a pickup leave one side of the road, cross the seam and drive back onto it',
  (landscape) => {
    const settings = { ...defaults, landscape, vehicle: 'pickup' as const }
    const world = new World(settings)
    const found = plan(world)
    expect(found.route.length).toBeGreaterThan(200)
    const points: { x: number; s: number }[] = []
    let lap = 0
    let turn = 0
    let last = found.route[0]
    for (const step of found.route) {
      if (last && step.row - last.row > found.rows / 2) lap--
      if (last && last.row - step.row > found.rows / 2) lap++
      if (last && step.column - last.column > found.columns / 2) turn--
      if (last && last.column - step.column > found.columns / 2) turn++
      last = step
      const s = (step.row + 0.5) * cell + lap * worldLoop.length
      points.push({
        x:
          world.road(s).x +
          (step.column + 0.5) * cell -
          worldLoop.width / 2 +
          turn * worldLoop.width,
        s,
      })
    }
    const first = points[0]
    const final = points[points.length - 1]
    if (!first || !final) throw new Error('Route is empty')
    points.push({ x: world.road(final.s).x + turn * worldLoop.width, s: final.s })
    const car = new CarPhysics(world)
    car.reset(first.s)
    car.x = world.canonical(first.x, first.s)
    const heading = points[4] ?? first
    car.yaw = Math.atan2(-(heading.x - first.x), heading.s - first.s)
    car.suspension.reset(car)
    let target = 0
    let shift = 0
    let previous = car.x
    let arrived = false
    for (let step = 0; step < 900 * 120 && !arrived; step++) {
      if (Math.abs(car.x - previous) > worldLoop.width / 2)
        shift += Math.sign(previous - car.x) * worldLoop.width
      previous = car.x
      const x = car.x + shift
      while (
        target < points.length - 1 &&
        Math.hypot((points[target]?.x ?? 0) - x, (points[target]?.s ?? 0) - car.s) < 22
      )
        target++
      const goal = points[target] ?? first
      const error = angleDifference(Math.atan2(-(goal.x - x), goal.s - car.s), car.yaw)
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
      arrived =
        shift !== 0 &&
        Math.abs(roadCoordinates(world, car.x, car.s).distance) < roadLayout.halfWidth
    }
    expect(arrived).toBe(true)
    expect(car.hits).toBe(0)
  },
  900000,
)
