import { describe, expect, it } from 'bun:test'
import {
  ambienceLevels,
  echoDelay,
  freshAmbience,
  freshSurroundings,
  impulseResponse,
  type Space,
  spaceMix,
  spaceShapes,
  spaces,
  surveyLayout,
  surveySurroundings,
  wildlifeHours,
} from './soundscape'
import { defaults, type Settings, World } from './world'

const rate = 48000

class ShapedWorld extends World {
  constructor(
    settings: Settings,
    private shape: (offset: number) => number,
  ) {
    super(settings)
  }
  override road(_s: number) {
    return { x: 0, y: 10, dx: 0, dy: 0, yaw: 0 }
  }
  override height(position: number, _s: number) {
    return 10 + this.shape(position)
  }
}

const survey = (shape: (offset: number) => number, settings: Partial<Settings> = {}) =>
  surveySurroundings(
    new ShapedWorld({ ...defaults, landscape: 'desert', ...settings }, shape),
    0,
    500,
    0,
    freshSurroundings(),
  )

describe('surroundings', () => {
  it('hears open ground, a wall on one side, and a cutting on both', () => {
    const field = survey(() => 0)
    expect(field.enclosure).toBe(0)
    expect(field.wall).toBe(surveyLayout.open)
    const cliff = survey((offset) => (offset > 6 ? 14 : 0))
    expect(cliff.right).toBeCloseTo(1, 6)
    expect(cliff.left).toBe(0)
    expect(cliff.enclosure).toBeGreaterThan(0.5)
    expect(cliff.wall).toBe(surveyLayout.near)
    const cutting = survey((offset) => (Math.abs(offset) > 6 ? 14 : 0))
    expect(cutting.enclosure).toBeCloseTo(1, 6)
    expect(cutting.enclosure).toBeGreaterThan(cliff.enclosure)
    expect(echoDelay(cliff)).toBeLessThan(echoDelay(field))
    expect(echoDelay(cliff)).toBeCloseTo((2 * surveyLayout.near) / 343, 6)
  })

  it('finds water beside the road and hears it closer when it is nearer', () => {
    const dry = survey(() => 0)
    const near = survey((offset) => (offset < -10 ? -12 : 0))
    const far = survey((offset) => (offset < -50 ? -12 : 0))
    expect(dry.water).toBe(0)
    expect(near.water).toBeGreaterThan(far.water)
    expect(far.water).toBeGreaterThan(0)
  })

  it('surveys a real landscape within bounds and finds its waterfalls', () => {
    const world = new World({ ...defaults, landscape: 'alpine' })
    const around = freshSurroundings()
    let loudest = 0
    for (let s = 0; s < 12000; s += 40) {
      const road = world.road(s)
      surveySurroundings(world, road.x, s, road.yaw, around)
      for (const value of [
        around.left,
        around.right,
        around.enclosure,
        around.forest,
        around.water,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
      expect(Math.abs(around.fallsPan)).toBeLessThanOrEqual(1)
      loudest = Math.max(loudest, around.falls)
    }
    expect(loudest).toBeGreaterThan(0.2)
  })

  it('mixes the three spaces from what surrounds the car', () => {
    const levels: Record<Space, number> = { open: 0, cut: 0, forest: 0 }
    spaceMix({ ...freshSurroundings() }, levels)
    expect(levels.open).toBeGreaterThan(levels.cut + levels.forest)
    spaceMix({ ...freshSurroundings(), enclosure: 1 }, levels)
    expect(levels.cut).toBeGreaterThan(levels.open * 3)
    spaceMix({ ...freshSurroundings(), forest: 1 }, levels)
    expect(levels.forest).toBeGreaterThan(levels.open * 3)
  })
})

describe('ambience', () => {
  const quiet = freshSurroundings()
  const levels = (settings: Partial<Settings>, around = quiet) =>
    ambienceLevels({ ...defaults, ...settings }, 0, around, freshAmbience())

  it('sings by day, chirps at dusk and falls quiet in winter nights', () => {
    const day = levels({ daylight: 'day' })
    const dusk = levels({ daylight: 'dusk' })
    const night = levels({ daylight: 'night' })
    expect(day.birds).toBeGreaterThan(0.2)
    expect(day.insects).toBe(0)
    expect(dusk.insects).toBeGreaterThan(day.birds)
    expect(dusk.birds).toBeLessThan(day.birds * 0.5)
    expect(night.birds).toBe(0)
    expect(night.insects).toBeGreaterThan(0)
    expect(levels({ daylight: 'dawn' }).birds).toBeGreaterThan(day.birds)
    expect(levels({ daylight: 'dusk', season: 'winter' }).insects).toBe(0)
    expect(levels({ daylight: 'day', season: 'winter' }).birds).toBeLessThan(day.birds)
  })

  it('hushes the birds in rain and silences them in a storm', () => {
    const fair = levels({ daylight: 'day' })
    expect(levels({ daylight: 'day', weather: 'rain' }).birds).toBeLessThan(fair.birds * 0.5)
    expect(levels({ daylight: 'day', weather: 'storm' }).birds).toBe(0)
    expect(levels({ weather: 'storm' }).breeze).toBeGreaterThan(fair.breeze * 3)
  })

  it('buzzes with cicadas only in hot or lush country by day', () => {
    expect(levels({ landscape: 'desert', daylight: 'day' }).cicadas).toBeGreaterThan(0)
    expect(levels({ landscape: 'jungle', daylight: 'day' }).cicadas).toBeGreaterThan(0)
    expect(levels({ landscape: 'highlands', daylight: 'day' }).cicadas).toBe(0)
    expect(levels({ landscape: 'desert', daylight: 'night' }).cicadas).toBe(0)
  })

  it('hears leaves in forest, surf on a coast, lapping on a lake and a waterfall nearby', () => {
    const wooded = { ...quiet, forest: 1 }
    expect(levels({}, wooded).leaves).toBeGreaterThan(levels({}).leaves)
    expect(levels({ daylight: 'day' }, wooded).birds).toBeGreaterThan(
      levels({ daylight: 'day' }).birds,
    )
    const shore = { ...quiet, water: 0.8 }
    const coast = levels({ landscape: 'highlands' }, shore)
    const lake = levels({ landscape: 'alpine' }, shore)
    expect(coast.surf).toBeGreaterThan(0.5)
    expect(lake.surf).toBe(0)
    expect(lake.water).toBeGreaterThan(coast.water)
    expect(levels({}, { ...quiet, falls: 0.7 }).falls).toBeCloseTo(0.7, 6)
    expect(levels({ season: 'winter' }, { ...quiet, falls: 0.7 }).falls).toBeLessThan(0.3)
  })

  it('blends the hours smoothly through the day cycle', () => {
    let before = wildlifeHours('cycle', 0)
    for (let clock = 1; clock <= 720; clock += 1) {
      const now = wildlifeHours('cycle', clock)
      expect(Math.abs(now.birds - before.birds)).toBeLessThan(0.06)
      expect(Math.abs(now.insects - before.insects)).toBeLessThan(0.06)
      before = now
    }
  })
})

describe('impulse responses', () => {
  const measure = (space: Space) => {
    const [left, right] = impulseResponse(space, rate)
    let energy = 0
    let sum = 0
    let crossings = 0
    let late = 0
    for (let i = 0; i < left.length; i++) {
      const value = left[i] as number
      energy += value * value
      sum += value
      if (i > 0 && value > 0 !== (left[i - 1] as number) > 0) crossings++
      if (i > left.length / 2) late += value * value
    }
    let apart = 0
    for (let i = 0; i < left.length; i++)
      apart += Math.abs((left[i] as number) - (right[i] as number))
    return {
      left,
      energy,
      mean: sum / left.length,
      brightness: crossings / left.length,
      late,
      apart,
    }
  }

  it.each(spaces)('%s is finite, centred, unit energy and dies away', (space) => {
    const response = measure(space)
    expect(response.left.length).toBe(Math.round(spaceShapes[space].seconds * rate))
    expect(response.left.every(Number.isFinite)).toBe(true)
    expect(response.energy).toBeCloseTo(1, 2)
    expect(Math.abs(response.mean)).toBeLessThan(1e-4)
    expect(response.late).toBeLessThan(0.05)
    expect(response.left[response.left.length - 1]).toBeCloseTo(0, 4)
    expect(response.apart).toBeGreaterThan(1)
  })

  it('rings longest off rock, darkest in forest, and slaps back from a wall', () => {
    expect(spaceShapes.cut.seconds).toBeGreaterThan(spaceShapes.forest.seconds)
    expect(spaceShapes.forest.seconds).toBeGreaterThan(spaceShapes.open.seconds)
    expect(measure('forest').brightness).toBeLessThan(measure('cut').brightness * 0.8)
    const { left } = measure('cut')
    const around = (seconds: number) => {
      let peak = 0
      for (let i = Math.round(seconds * rate); i < (seconds + 0.008) * rate; i++)
        peak = Math.max(peak, Math.abs(left[i] as number))
      return peak
    }
    expect(around(0.071)).toBeGreaterThan(around(0.05) * 2)
    expect(spaceShapes.forest.echoes).toHaveLength(0)
  })
})
