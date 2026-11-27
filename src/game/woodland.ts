import { acrossSpan, alongSpan, latticeValue, smoothStep } from './field'
import { landscapeProfiles } from './landscapes'
import { clamp, type Landscape, random, type World } from './world'

export const coniferBuild = { slim: 0.6, spread: 0.2 }

export const woodlandLattice = { cell: 8, jitter: 5 } as const

export interface WoodlandTree {
  variant: 0 | 1 | 4 | 5
  x: number
  s: number
  ground: number
  height: number
  width: number
  yaw: number
  shade: number
  slopeX: number
  slopeS: number
}

export function roadsidePlantHeight(world: World, x: number, s: number) {
  const surface = world.surface(x, s)
  return surface.height >= 0.5 && Math.hypot(surface.slopeX, surface.slopeS) <= 0.65
    ? surface.height
    : null
}

function noise(x: number, s: number, scale: number, seed: number) {
  const u = x / acrossSpan(scale)
  const v = s / alongSpan(scale)
  const strip = Math.floor(u)
  const cell = Math.floor(v)
  const tx = smoothStep(u - strip)
  const ts = smoothStep(v - cell)
  const near = latticeValue(strip, cell, seed) * (1 - tx) + latticeValue(strip + 1, cell, seed) * tx
  const far =
    latticeValue(strip, cell + 1, seed) * (1 - tx) + latticeValue(strip + 1, cell + 1, seed) * tx
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

export function woodlandTrees(
  world: World,
  left: number,
  near: number,
  width: number,
  length: number,
  thin = 1,
) {
  const trees: WoodlandTree[] = []
  const profile = landscapeProfiles[world.settings.landscape]
  const woodland = profile.woodland
  if (!woodland) return trees
  const seed = world.settings.seed
  const { cell, jitter } = woodlandLattice
  const lastRow = Math.ceil((near + length) / cell)
  const lastColumn = Math.ceil((left + width) / cell)
  for (let row = Math.floor(near / cell); row < lastRow; row++) {
    for (let column = Math.floor(left / cell); column < lastColumn; column++) {
      if (thin > 1 && (latticeValue(column, row, seed + 7717) + 1) * thin >= 2) continue
      const rng = random(Math.imul(row, 94537) ^ Math.imul(column, 62969) ^ seed)
      const x = (column + 0.5) * cell + (rng() - 0.5) * jitter
      const s = (row + 0.5) * cell + (rng() - 0.5) * jitter
      if (Math.abs(x - world.road(s).x) < woodland.start) continue
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
        ground: surface.height,
        height,
        width,
        yaw: rng() * Math.PI,
        shade: 0.82 + rng() * 0.28,
        slopeX: surface.slopeX,
        slopeS: surface.slopeS,
      })
    }
  }
  return trees
}

export const openScatter = {
  cell: 32,
  jitter: 24,
  clear: 40,
  grove: 0.35,
  trees: 0.18,
  shrubs: 0.7,
} as const

export interface OpenShrub {
  variant: 2 | 3
  x: number
  s: number
  ground: number
  height: number
  width: number
  yaw: number
  shade: number
}

export function scatteredPlants(
  world: World,
  left: number,
  near: number,
  width: number,
  length: number,
  thin = 1,
) {
  const trees: WoodlandTree[] = []
  const shrubs: OpenShrub[] = []
  const { landscape, seed } = world.settings
  const profile = landscapeProfiles[landscape]
  const { roadside } = profile
  const treeShare = Math.min(0.5, (roadside.trees / 28) * openScatter.trees)
  const shrubShare = Math.min(0.5, (roadside.shrubs / 180) * openScatter.shrubs)
  const { cell, jitter } = openScatter
  const lastRow = Math.ceil((near + length) / cell)
  const lastColumn = Math.ceil((left + width) / cell)
  for (let row = Math.floor(near / cell); row < lastRow; row++) {
    for (let column = Math.floor(left / cell); column < lastColumn; column++) {
      const rng = random(Math.imul(row, 51787) ^ Math.imul(column, 77591) ^ (seed + 3301))
      const pick = rng()
      const tree = pick < treeShare
      if (!tree && (thin > 1 || pick >= treeShare + shrubShare)) continue
      if (tree && thin > 1 && (latticeValue(column, row, seed + 9941) + 1) * thin >= 2) continue
      const x = (column + 0.5) * cell + (rng() - 0.5) * jitter
      const s = (row + 0.5) * cell + (rng() - 0.5) * jitter
      if (Math.abs(x - world.road(s).x) < openScatter.clear) continue
      if (woodlandCoverage(x, s, seed, landscape) > openScatter.grove) continue
      const surface = world.surface(x, s)
      if (surface.height < 0.7 || Math.hypot(surface.slopeX, surface.slopeS) > 0.65) continue
      if (
        profile.treeLine !== null &&
        rng() > clamp((profile.treeLine - surface.height) / 60, 0, 1)
      )
        continue
      const yaw = rng() * Math.PI
      const shade = 0.88 + rng() * 0.24
      if (!tree) {
        const height = 2 + rng() * 4
        shrubs.push({
          variant: rng() < 0.5 ? 2 : 3,
          x,
          s,
          ground: surface.height,
          height,
          width: height * (0.85 + rng() * 0.35),
          yaw,
          shade,
        })
        continue
      }
      const choice = rng()
      const variant =
        choice < roadside.conifers
          ? 4
          : choice < roadside.conifers + roadside.narrow
            ? 5
            : rng() < 0.5
              ? 0
              : 1
      const height = variant >= 4 ? 6 + rng() * 6 : 5 + rng() * 4
      trees.push({
        variant,
        x,
        s,
        ground: surface.height,
        height,
        width:
          height *
          (variant === 4
            ? coniferBuild.slim + rng() * coniferBuild.spread
            : variant === 5
              ? 0.42 + rng() * 0.13
              : 0.9 + rng() * 0.2),
        yaw,
        shade,
        slopeX: surface.slopeX,
        slopeS: surface.slopeS,
      })
    }
  }
  return { trees, shrubs }
}
