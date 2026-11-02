import { latticeValue, smoothStep } from './field'
import { clamp, type Landscape, random, type Settings, type World } from './world'

export interface WoodlandTree {
  variant: 0 | 1 | 4 | 5
  x: number
  y: number
  s: number
  height: number
  width: number
  yaw: number
  shade: number
}

function noise(x: number, s: number, scale: number, seed: number) {
  const u = x / scale
  const v = s / scale
  const column = Math.floor(u)
  const row = Math.floor(v)
  const tx = smoothStep(u - column)
  const ts = smoothStep(v - row)
  const near = latticeValue(column, row, seed) * (1 - tx) + latticeValue(column + 1, row, seed) * tx
  const far =
    latticeValue(column, row + 1, seed) * (1 - tx) + latticeValue(column + 1, row + 1, seed) * tx
  return near * (1 - ts) + far * ts
}

export function woodlandDensity(x: number, s: number, seed: number) {
  return noise(x, s, 210, seed + 5489) * 0.72 + noise(x, s, 70, seed + 9137) * 0.28
}

export function woodlandCoverage(x: number, s: number, seed: number, landscape: Landscape) {
  if (landscape === 'desert') return 0
  return smoothStep(
    clamp(
      (woodlandDensity(x, s, seed) - (landscape === 'alpine' ? -0.02 : 0.08) + 0.18) / 0.36,
      0,
      1,
    ),
  )
}

export function createWoodland(world: World, tile: number, quality: Settings['quality']) {
  const trees: WoodlandTree[] = []
  if (world.settings.landscape === 'desert') return trees
  const low = quality === 'low'
  const alpine = world.settings.landscape === 'alpine'
  const seed = world.settings.seed
  for (let row = tile * 15; row < (tile + 1) * 15; row++) {
    if (low && row % 3 !== 0) continue
    const center = world.road(row * 8 + 4).x
    const first = Math.floor((center - 650) / 8)
    const last = Math.ceil((center + 650) / 8)
    for (let column = first; column <= last; column++) {
      if (low && column % 3 !== 0) continue
      const rng = random(Math.imul(row, 94537) ^ Math.imul(column, 62969) ^ seed)
      const x = column * 8 + 4 + (rng() - 0.5) * 5
      const s = row * 8 + 4 + (rng() - 0.5) * 5
      const distance = Math.abs(x - world.road(s).x)
      if (distance < 60 || distance > (low ? 360 : 650)) continue
      const coverage = woodlandCoverage(x, s, seed, world.settings.landscape)
      if (rng() > coverage) continue
      const surface = world.surface(x, s)
      if (surface.height < 0.7 || Math.hypot(surface.slopeX, surface.slopeS) > 1.1) continue
      if (alpine && rng() > clamp((220 - surface.height) / 60, 0, 1)) continue
      const choice = rng()
      const evergreen = alpine ? 0.7 : 0.3
      const variant = choice < evergreen ? 4 : choice < evergreen + 0.15 ? 5 : rng() < 0.5 ? 0 : 1
      const height = 7 + rng() * 6
      const width =
        height *
        (variant === 4
          ? 0.42 + rng() * 0.16
          : variant === 5
            ? 0.42 + rng() * 0.13
            : 0.8 + rng() * 0.2)
      trees.push({
        variant,
        x,
        y: surface.height - 0.1,
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
