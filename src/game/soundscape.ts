import { cycleStage, type DayPhase } from './atmosphere'
import { Noise } from './dsp'
import { smoothStep, worldLoop, wrapOffset } from './field'
import { landscapeProfiles } from './landscapes'
import { lapWaterfalls } from './waterfalls'
import { woodlandCoverage } from './woodland'
import { clamp, type Settings, shoreHeight, type World } from './world'

export interface Surroundings {
  left: number
  right: number
  enclosure: number
  wall: number
  forest: number
  water: number
  falls: number
  fallsPan: number
}

export const surveyLayout = {
  near: 12,
  far: 26,
  low: 1.5,
  high: 8.5,
  woods: 30,
  shore: [14, 34, 70],
  reach: 90,
  fallsReach: 45,
  open: 60,
} as const

export function freshSurroundings(): Surroundings {
  return {
    left: 0,
    right: 0,
    enclosure: 0,
    wall: surveyLayout.open,
    forest: 0,
    water: 0,
    falls: 0,
    fallsPan: 0,
  }
}

function wrapLap(offset: number) {
  return offset - worldLoop.length * Math.round(offset / worldLoop.length)
}

export function surveySurroundings(
  world: World,
  x: number,
  s: number,
  yaw: number,
  out: Surroundings,
) {
  const { near, far, low, high, woods, shore, reach, fallsReach, open } = surveyLayout
  const settings = world.settings
  const road = world.road(s)
  let wall: number = open
  let water = 0
  for (const side of [-1, 1]) {
    const close = world.height(road.x + side * near, s) - road.y
    const beyond = world.height(road.x + side * far, s) - road.y
    const rise = Math.max(close, beyond * 0.7)
    const face = smoothStep(clamp((rise - low) / (high - low), 0, 1))
    if (side < 0) out.left = face
    else out.right = face
    if (face > 0.2) wall = Math.min(wall, close > low ? near : far)
    for (const distance of shore) {
      if (world.height(x + side * distance, s) > shoreHeight * 0.4) continue
      water = Math.max(water, 1 - distance / reach)
      break
    }
  }
  out.enclosure = clamp(
    0.65 * Math.max(out.left, out.right) + 0.6 * Math.min(out.left, out.right),
    0,
    1,
  )
  out.wall = wall
  out.water = water
  const profile = landscapeProfiles[settings.landscape]
  const cover =
    (woodlandCoverage(x - woods, s, settings.seed, settings.landscape) +
      woodlandCoverage(x + woods, s, settings.seed, settings.landscape)) /
    2
  out.forest = clamp(cover * 0.85 + Math.min(0.4, profile.roadside.trees / 120), 0, 1)
  out.falls = 0
  out.fallsPan = 0
  for (const fall of lapWaterfalls(world)) {
    const ds = wrapLap(fall.foot.s - s)
    if (Math.abs(ds) > 400) continue
    const dx = wrapOffset(fall.foot.x - x)
    const distance = Math.hypot(dx, ds)
    const level = clamp(fall.height / 14, 0.5, 1.4) / (1 + (distance / fallsReach) ** 2)
    if (level <= out.falls) continue
    out.falls = level
    out.fallsPan = clamp((Math.cos(yaw) * dx + Math.sin(yaw) * ds) / (distance + 6), -1, 1)
  }
  return out
}

const phases: Record<DayPhase, { birds: number; insects: number }> = {
  dawn: { birds: 1, insects: 0.15 },
  day: { birds: 0.6, insects: 0 },
  sunset: { birds: 0.5, insects: 0.4 },
  dusk: { birds: 0.12, insects: 1 },
  night: { birds: 0, insects: 0.7 },
}

export function wildlifeHours(daylight: Settings['daylight'], clock: number) {
  if (daylight !== 'cycle') return phases[daylight]
  const stage = cycleStage(clock)
  const from = phases[stage.from]
  const to = phases[stage.to]
  return {
    birds: from.birds + (to.birds - from.birds) * stage.blend,
    insects: from.insects + (to.insects - from.insects) * stage.blend,
  }
}

const breezes: Record<Settings['weather'], number> = {
  clear: 0.12,
  overcast: 0.2,
  rain: 0.25,
  storm: 0.8,
  fog: 0.06,
}

export interface Ambience {
  birds: number
  insects: number
  cicadas: number
  breeze: number
  leaves: number
  water: number
  surf: number
  falls: number
}

export function ambienceLevels(
  settings: Pick<Settings, 'landscape' | 'season' | 'weather' | 'daylight'>,
  clock: number,
  around: Surroundings,
  out: Ambience,
) {
  const hours = wildlifeHours(settings.daylight, clock)
  const profile = landscapeProfiles[settings.landscape]
  const winter = settings.season === 'winter'
  const dry = settings.weather === 'clear' || settings.weather === 'overcast' ? 1 : 0
  const calm = settings.weather === 'storm' ? 0 : settings.weather === 'rain' ? 0.25 : 1
  const green = clamp(0.3 + around.forest + (profile.woodland ? 0.2 : 0), 0, 1)
  const hot = settings.landscape === 'desert' || settings.landscape === 'canyon'
  const lush = settings.landscape === 'jungle'
  out.birds = hours.birds * calm * green * (winter ? 0.35 : 1) * (hot ? 0.4 : 1)
  out.insects = winter ? 0 : hours.insects * calm * (hot ? 0.6 : lush ? 1.3 : 1)
  out.cicadas =
    winter || !(hot || lush) ? 0 : dry * clamp(hours.birds * 1.4 - hours.insects, 0, 1) * 0.8
  out.breeze = breezes[settings.weather] * (1 - 0.5 * around.enclosure)
  out.leaves = around.forest * (0.25 + breezes[settings.weather]) * (winter ? 0.4 : 1)
  const sea = profile.coast !== 'none'
  const frozen = winter ? 0.3 : 1
  out.water = sea ? around.water * 0.35 * frozen : around.water * frozen
  out.surf = sea ? around.water * frozen : 0
  out.falls = around.falls * frozen
  return out
}

export function freshAmbience(): Ambience {
  return { birds: 0, insects: 0, cicadas: 0, breeze: 0, leaves: 0, water: 0, surf: 0, falls: 0 }
}

export type Space = 'open' | 'cut' | 'forest'
export const spaces = ['open', 'cut', 'forest'] as const

export const spaceShapes: Record<
  Space,
  {
    seconds: number
    decay: number
    build: number
    bright: number
    dull: number
    tail: number
    echoes: readonly (readonly [seconds: number, level: number])[]
  }
> = {
  open: {
    seconds: 0.5,
    decay: 0.1,
    build: 0.004,
    bright: 5200,
    dull: 1400,
    tail: 0.35,
    echoes: [
      [0.007, 0.5],
      [0.21, 0.22],
    ],
  },
  cut: {
    seconds: 1.5,
    decay: 0.33,
    build: 0.012,
    bright: 6800,
    dull: 1500,
    tail: 0.45,
    echoes: [
      [0.071, 0.8],
      [0.113, 0.62],
      [0.162, 0.5],
      [0.234, 0.38],
      [0.317, 0.3],
      [0.46, 0.2],
    ],
  },
  forest: {
    seconds: 0.9,
    decay: 0.17,
    build: 0.035,
    bright: 3600,
    dull: 650,
    tail: 1,
    echoes: [],
  },
}

export function impulseResponse(space: Space, rate: number): [Float32Array, Float32Array] {
  const shape = spaceShapes[space]
  const length = Math.round(shape.seconds * rate)
  const sides: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)]
  for (let side = 0; side < 2; side++) {
    const data = sides[side as 0 | 1]
    const noise = new Noise(4099 * (side + 1) + space.length * 131)
    let held = 0
    for (let index = 0; index < length; index++) {
      const time = index / rate
      const fade = Math.exp(-time / shape.decay)
      const cutoff = shape.dull + (shape.bright - shape.dull) * fade
      held += (noise.next() - held) * (1 - Math.exp((-2 * Math.PI * cutoff) / rate))
      data[index] = held * fade * (1 - Math.exp(-time / shape.build)) * shape.tail
    }
    for (const [seconds, level] of shape.echoes) {
      const start = Math.round(seconds * (side ? 1.09 : 1) * rate)
      const smear = Math.round(0.006 * rate)
      let soft = 0
      for (let index = 0; index < smear && start + index < length; index++) {
        const window = Math.sin((Math.PI * index) / smear)
        soft += (noise.next() - soft) * 0.5
        data[start + index] = (data[start + index] as number) + soft * window * level * 3
      }
    }
    let mean = 0
    for (let index = 0; index < length; index++) mean += data[index] as number
    mean /= length
    let energy = 0
    for (let index = 0; index < length; index++) {
      const value = (data[index] as number) - mean
      data[index] = value
      energy += value * value
    }
    const scale = 1 / Math.sqrt(Math.max(energy, 1e-9))
    const close = Math.round(0.01 * rate)
    for (let index = 0; index < length; index++) {
      const closing = Math.min(1, (length - index) / close)
      data[index] = (data[index] as number) * scale * closing
    }
  }
  return sides
}

export function spaceMix(around: Surroundings, out: Record<Space, number>) {
  out.cut = around.enclosure
  out.forest = around.forest * (1 - 0.6 * around.enclosure)
  out.open = clamp(1 - out.cut - out.forest, 0.2, 1) * 0.6
  return out
}

export function echoDelay(around: Surroundings) {
  return clamp((2 * around.wall) / 343, 0.04, 0.45)
}
