import { latticeValue, loopCells, loopColumns, loopIndex, smoothStep, worldLoop } from './field'
import { landscapeProfiles } from './landscapes'
import { clamp, type Landscape, random, type Settings, type World } from './world'

export const coniferBuild = { slim: 0.6, spread: 0.2 }

export interface WoodlandTree {
  variant: 0 | 1 | 4 | 5
  x: number
  s: number
  height: number
  width: number
  yaw: number
  shade: number
}

export function roadsidePlantHeight(world: World, x: number, s: number) {
  const surface = world.surface(x, s)
  return surface.height >= 0.5 && Math.hypot(surface.slopeX, surface.slopeS) <= 0.65
    ? surface.height
    : null
}

function noise(x: number, s: number, scale: number, seed: number) {
  const rows = loopCells(scale)
  const columns = loopColumns(scale)
  const u = (x * columns) / worldLoop.width
  const v = (s * rows) / worldLoop.length
  const strip = Math.floor(u)
  const cell = Math.floor(v)
  const tx = smoothStep(u - strip)
  const ts = smoothStep(v - cell)
  const column = loopIndex(strip, columns)
  const beside = loopIndex(strip + 1, columns)
  const row = loopIndex(cell, rows)
  const next = loopIndex(cell + 1, rows)
  const near = latticeValue(column, row, seed) * (1 - tx) + latticeValue(beside, row, seed) * tx
  const far = latticeValue(column, next, seed) * (1 - tx) + latticeValue(beside, next, seed) * tx
  return near * (1 - ts) + far * ts
}

export function woodlandDensity(x: number, s: number, seed: number) {
  return noise(x, s, 210, seed + 5489) * 0.72 + noise(x, s, 70, seed + 9137) * 0.28
}

export function woodlandCoverage(x: number, s: number, seed: number, landscape: Landscape) {
  const woodland = landscapeProfiles[landscape].woodland
  if (!woodland) return 0
  return smoothStep(clamp((woodlandDensity(x, s, seed) - woodland.threshold + 0.18) / 0.36, 0, 1))
}

export function createWoodland(world: World, tile: number, quality: Settings['quality']) {
  const trees: WoodlandTree[] = []
  const profile = landscapeProfiles[world.settings.landscape]
  const woodland = profile.woodland
  if (!woodland) return trees
  const low = quality === 'low'
  const seed = world.settings.seed
  for (let row = tile * 15; row < (tile + 1) * 15; row++) {
    if (low && row % 3 !== 0) continue
    const center = world.road(row * 8 + 4).x
    const first = Math.floor((center - woodland.reach) / 8)
    const last = Math.ceil((center + woodland.reach) / 8)
    for (let column = first; column <= last; column++) {
      if (low && column % 3 !== 0) continue
      const rng = random(
        Math.imul(loopIndex(row, loopCells(8)), 94537) ^ Math.imul(column, 62969) ^ seed,
      )
      const x = column * 8 + 4 + (rng() - 0.5) * 5
      const s = row * 8 + 4 + (rng() - 0.5) * 5
      const distance = Math.abs(x - world.road(s).x)
      if (
        distance < woodland.start ||
        distance > (low ? (woodland.reach * 36) / 65 : woodland.reach)
      )
        continue
      const coverage = woodlandCoverage(x, s, seed, world.settings.landscape)
      if (rng() > coverage) continue
      const surface = world.surface(x, s)
      if (surface.height < 0.7 || Math.hypot(surface.slopeX, surface.slopeS) > 1.1) continue
      if (
        profile.treeLine !== null &&
        rng() > clamp((profile.treeLine - surface.height) / 60, 0, 1)
      )
        continue
      const choice = rng()
      const evergreen = woodland.evergreen
      const variant = choice < evergreen ? 4 : choice < evergreen + 0.15 ? 5 : rng() < 0.5 ? 0 : 1
      const height = 7 + rng() * 6
      const width =
        height *
        (variant === 4
          ? coniferBuild.slim + rng() * coniferBuild.spread
          : variant === 5
            ? 0.42 + rng() * 0.13
            : 0.8 + rng() * 0.2)
      trees.push({
        variant,
        x,
        s,
        height,
        width,
        yaw: rng() * Math.PI,
        shade: 0.82 + rng() * 0.28,
      })
    }
  }
  return trees
}
