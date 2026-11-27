import { expect, test } from 'bun:test'
import {
  coniferBuild,
  openScatter,
  roadsidePlantHeight,
  scatteredPlants,
  woodlandCoverage,
  woodlandDensity,
  woodlandTrees,
} from './woodland'
import { defaults, World } from './world'

test.each(['highlands', 'alpine'] as const)(
  '%s roadside shrubs avoid the exposed cut and return above it',
  (landscape) => {
    const world = new World({ ...defaults, landscape })
    const s = 450
    const road = world.road(s)
    expect(roadsidePlantHeight(world, road.x + 10, s)).toBe(null)
    expect(roadsidePlantHeight(world, road.x + 24, s)).toBe(world.surface(road.x + 24, s).height)
  },
)

function section(world: World, tile: number, thin = 1) {
  return woodlandTrees(world, world.road(tile * 120 + 60).x - 640, tile * 120, 1280, 120, thin)
}

test('woodland is deterministic and preserves tree positions across seasons', () => {
  const world = new World({ ...defaults })
  const summer = section(world, 3)
  expect(summer.length).toBeGreaterThan(0)
  expect(section(world, 3)).toEqual(summer)
  world.settings.season = 'winter'
  expect(section(world, 3)).toEqual(summer)
  world.settings.seed = 73
  expect(section(world, 3)).not.toEqual(summer)
})

test('low detail retains a stable subset of the same woodland', () => {
  for (const tile of [-5, 3, 7]) {
    const world = new World({ ...defaults })
    const high = section(world, tile)
    const low = section(world, tile, 3)
    const positions = new Map(high.map((tree) => [`${tree.x}:${tree.s}`, tree]))
    expect(low.length).toBeLessThan(high.length)
    for (const tree of low) expect(positions.get(`${tree.x}:${tree.s}`)).toEqual(tree)
  }
})

test('grove density is continuous across section and noise-cell boundaries', () => {
  for (const s of [-210, -120, 0, 70, 120, 210])
    for (const x of [-210, -70, 0, 70, 210]) {
      const before = woodlandDensity(x - 0.0001, s - 0.0001, 42)
      const after = woodlandDensity(x + 0.0001, s + 0.0001, 42)
      expect(Math.abs(after - before)).toBeLessThan(0.00001)
    }
  const values = Array.from({ length: 100 }, (_, i) => woodlandDensity(i * 25, i * 31, 42))
  expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.8)
})

test('shared grove coverage stays bounded and leaves deserts clear', () => {
  for (let i = -50; i <= 50; i++) {
    const x = i * 37
    const s = i * 29
    const highland = woodlandCoverage(x, s, 42, 'highlands')
    const alpine = woodlandCoverage(x, s, 42, 'alpine')
    expect(highland).toBeGreaterThanOrEqual(0)
    expect(alpine).toBeLessThanOrEqual(1)
    expect(alpine).toBeGreaterThanOrEqual(highland)
    expect(woodlandCoverage(x, s, 42, 'desert')).toBe(0)
  }
})

test('tree placement leaves the corridor open and rejects water and steep faces', () => {
  const world = new World({ ...defaults, landscape: 'alpine' })
  for (const tile of [-2, 0, 3])
    for (const tree of section(world, tile)) {
      const surface = world.surface(tree.x, tree.s)
      expect(Math.abs(tree.x - world.road(tree.s).x) - tree.width / 2).toBeGreaterThan(45)
      expect(surface.height).toBeGreaterThanOrEqual(0.7)
      expect(Math.hypot(surface.slopeX, surface.slopeS)).toBeLessThanOrEqual(1.1)
      expect(tree.s).toBeGreaterThan(tile * 120)
      expect(tree.s).toBeLessThan((tile + 1) * 120)
    }
  world.height = () => -1
  expect(section(world, 0)).toEqual([])
})

test('deserts and exposed alpine peaks do not acquire dense woodland', () => {
  expect(section(new World({ ...defaults, landscape: 'desert' }), 0)).toEqual([])
  const alpine = new World({ ...defaults, landscape: 'alpine' })
  alpine.height = () => 230
  expect(section(alpine, 0)).toEqual([])
})

test('adjacent and distant terrain sections retain bounded distinct tree sets', () => {
  const world = new World({ ...defaults })
  const seen = new Set<string>()
  for (const tile of [-2, -1, 0, 1, 2, 8333]) {
    const trees = section(world, tile)
    expect(trees.length).toBeLessThanOrEqual(2500)
    for (const tree of trees) {
      const key = `${tree.x}:${tree.s}`
      expect(seen.has(key)).toBe(false)
      expect(Number.isFinite(tree.x + tree.s + tree.height + tree.width)).toBe(true)
      seen.add(key)
    }
  }
})

test('firs stand at the proportions of the photographed tree instead of a squeezed cone', () => {
  const world = new World({ ...defaults, landscape: 'forest' })
  let firs = 0
  for (const tile of [2, 3, 5, 8]) {
    for (const tree of section(world, tile)) {
      if (tree.variant !== 4) continue
      firs++
      const build = tree.width / tree.height
      expect(build).toBeGreaterThanOrEqual(coniferBuild.slim)
      expect(build).toBeLessThanOrEqual(coniferBuild.slim + coniferBuild.spread)
    }
  }
  expect(firs).toBeGreaterThan(20)
  expect(coniferBuild.slim).toBeGreaterThan(0.55)
})

test('open country between the groves carries scattered trees and shrubs away from the road', () => {
  const world = new World({ ...defaults })
  const spread = scatteredPlants(world, -2048, 4096, 4096, 1024)
  expect(scatteredPlants(world, -2048, 4096, 4096, 1024)).toEqual(spread)
  expect(spread.trees.length).toBeGreaterThan(20)
  expect(spread.shrubs.length).toBeGreaterThan(spread.trees.length)
  for (const plant of [...spread.trees, ...spread.shrubs]) {
    expect(plant.x).toBeGreaterThanOrEqual(-2048)
    expect(plant.x).toBeLessThan(2048)
    expect(Math.abs(plant.x - world.road(plant.s).x)).toBeGreaterThanOrEqual(openScatter.clear)
    expect(woodlandCoverage(plant.x, plant.s, 42, 'highlands')).toBeLessThanOrEqual(
      openScatter.grove,
    )
    const surface = world.surface(plant.x, plant.s)
    expect(plant.ground).toBeCloseTo(surface.height, 9)
    expect(surface.height).toBeGreaterThanOrEqual(0.7)
  }
  const whole = scatteredPlants(world, -1024, 4096, 1024, 512)
  const halves = [-1024, -512].map((left) => scatteredPlants(world, left, 4096, 512, 512))
  const spot = (plant: { x: number; s: number }) => `${plant.x}:${plant.s}`
  for (const kind of ['trees', 'shrubs'] as const) {
    const joined = halves.flatMap((half) => half[kind].map(spot))
    expect(new Set(joined).size).toBe(joined.length)
    expect(joined.sort()).toEqual(whole[kind].map(spot).sort())
  }
  const beside = scatteredPlants(world, world.road(600).x - 30, 480, 60, 240)
  expect(beside.trees.length + beside.shrubs.length).toBeLessThan(6)
})

test('distant open country keeps a stable share of the same lone trees and no shrubs', () => {
  const world = new World({ ...defaults })
  const near = scatteredPlants(world, -4096, 8192, 2048, 2048)
  const far = scatteredPlants(world, -4096, 8192, 2048, 2048, 3)
  const known = new Map(near.trees.map((tree) => [`${tree.x}:${tree.s}`, tree]))
  expect(far.shrubs).toEqual([])
  expect(far.trees.length).toBeGreaterThan(near.trees.length * 0.2)
  expect(far.trees.length).toBeLessThan(near.trees.length * 0.5)
  for (const tree of far.trees) expect(known.get(`${tree.x}:${tree.s}`)).toEqual(tree)
  const desert = scatteredPlants(new World({ ...defaults, landscape: 'desert' }), 0, 0, 2048, 2048)
  expect(desert.trees.length).toBeLessThan(near.trees.length * 0.4)
})

test('every tree carries the slope of the ground it stands on for its pool of shade', () => {
  const world = new World({ ...defaults, landscape: 'forest' })
  const trees = [3, 9, 14].flatMap((tile) => section(world, tile))
  expect(trees.length).toBeGreaterThan(20)
  for (const tree of trees) {
    const surface = world.surface(tree.x, tree.s)
    expect(tree.slopeX).toBe(surface.slopeX)
    expect(tree.slopeS).toBe(surface.slopeS)
    expect(Math.hypot(tree.slopeX, tree.slopeS)).toBeLessThanOrEqual(1.1)
  }
  const { trees: lone } = scatteredPlants(world, world.road(900).x - 640, 0, 1280, 1800)
  for (const tree of lone) expect(Number.isFinite(tree.slopeX + tree.slopeS)).toBe(true)
})
