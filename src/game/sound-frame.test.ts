import { describe, expect, it } from 'bun:test'
import { soundVehicles } from './engine-sound'
import { CarPhysics, type Input } from './physics'
import { engineProfiles } from './powertrain'
import { SoundFrame } from './sound-frame'
import { paramIndex, soundParams } from './sound-synth'
import { freshAmbience } from './soundscape'
import { vehicleMetrics } from './vehicles'
import { defaults, type Settings, vehicles, World } from './world'

const rest: Input = {
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}

function drive(
  changes: Partial<Settings>,
  input: (time: number) => Input,
  seconds: number,
  speed = 0,
  offset = 0,
) {
  const settings: Settings = { ...defaults, roadMode: 'straight', ...changes }
  const car = new CarPhysics(new World(settings))
  car.reset(300)
  car.update(1 / 60, rest, settings)
  car.speed = speed
  car.x += offset
  const frame = new SoundFrame()
  const ambience = freshAmbience()
  const peaks = new Float32Array(soundParams.length)
  let values = frame.values
  for (let step = 0; step < seconds * 60; step++) {
    const pedals = input(step / 60)
    car.update(1 / 60, pedals, settings)
    values = frame.update(car, pedals, settings, ambience, 1 / 60)
    for (let index = 0; index < values.length; index++)
      peaks[index] = Math.max(peaks[index] as number, values[index] as number)
  }
  expect(peaks.every(Number.isFinite)).toBe(true)
  const read = (name: keyof typeof paramIndex) => values[paramIndex[name]] as number
  const most = (name: keyof typeof paramIndex) => peaks[paramIndex[name]] as number
  return { car, read, most }
}

describe('sound frame', () => {
  it.each(vehicles)('%s reports its own engine and wheelbase', (vehicle) => {
    const { read, most, car } = drive({ vehicle }, () => ({ ...rest, throttle: 1 }), 2)
    expect(soundVehicles[read('vehicle')]).toBe(vehicle)
    expect(read('rpm')).toBeCloseTo(car.gearbox.rpm, 2)
    expect(read('idle')).toBe(engineProfiles[vehicle].idle)
    expect(read('redline')).toBe(engineProfiles[vehicle].redline)
    expect(read('wheelbase')).toBeCloseTo(vehicleMetrics[vehicle].wheelbase, 5)
    expect(most('load')).toBeGreaterThan(0.5)
    expect(read('throttle')).toBe(1)
  })

  it('rolls and blows with speed on dry tarmac and stays off the gravel voices', () => {
    const still = drive({}, () => rest, 1)
    const fast = drive({}, () => ({ ...rest, throttle: 0.5 }), 2, 35)
    expect(still.read('roll')).toBeLessThan(1e-6)
    expect(still.read('rush')).toBeLessThan(1e-6)
    expect(fast.read('roll')).toBeGreaterThan(0.05)
    expect(fast.read('rush')).toBeGreaterThan(0.05)
    expect(fast.read('joint')).toBeGreaterThan(0)
    expect(fast.most('gravel')).toBe(0)
    expect(fast.most('grains')).toBe(0)
    expect(fast.read('wet')).toBe(0)
    expect(fast.read('rain')).toBe(0)
  })

  it('swaps the road for loose ground off the tarmac', () => {
    const canyon = drive({ landscape: 'canyon' }, () => ({ ...rest, throttle: 0.4 }), 1.5, 15, 7)
    expect(canyon.most('gravel')).toBeGreaterThan(0.05)
    expect(canyon.most('grains')).toBeGreaterThan(5)
    expect(canyon.most('grass')).toBe(0)
    const meadow = drive({ landscape: 'highlands' }, () => ({ ...rest, throttle: 0.4 }), 1.5, 15, 8)
    expect(meadow.most('grass')).toBeGreaterThan(0.03)
    expect(meadow.most('grass')).toBeGreaterThan(meadow.most('gravel'))
  })

  it('wets the road and rains in a storm, but snows silently in winter', () => {
    const storm = drive({ weather: 'storm' }, () => ({ ...rest, throttle: 0.4 }), 1, 25)
    expect(storm.read('wet')).toBeGreaterThan(0.05)
    expect(storm.read('rain')).toBeGreaterThan(0.05)
    const snow = drive(
      { weather: 'storm', season: 'winter' },
      () => ({ ...rest, throttle: 0.4 }),
      1,
      25,
    )
    expect(snow.read('rain')).toBe(0)
    expect(snow.read('wet')).toBe(0)
  })

  it('squeals in a handbrake slide and skids under locked wheels', () => {
    const slide = drive(
      {},
      (time) => ({ ...rest, steer: 1, steeringSource: 'analog', handbrake: time > 0.3 }),
      2,
      26,
    )
    expect(Math.max(slide.most('squealLeft'), slide.most('squealRight'))).toBeGreaterThan(0.03)
    expect(slide.most('skid')).toBeGreaterThan(0.03)
    expect(slide.most('rough')).toBeGreaterThan(0.2)
    const calm = drive({}, () => ({ ...rest, throttle: 0.3 }), 2, 20)
    expect(calm.most('squealLeft')).toBe(0)
    expect(calm.most('skid')).toBe(0)
  })

  it('counts a thump when the suspension is jolted and none on smooth tarmac', () => {
    const smooth = drive({ roadWear: 'fresh' }, () => ({ ...rest, throttle: 0.3 }), 3, 20)
    expect(smooth.read('bumps')).toBe(0)
    const rough = drive(
      { roadWear: 'broken', vehicle: 'hatchback' },
      () => ({ ...rest, throttle: 0.4 }),
      12,
      22,
    )
    expect(rough.read('bumps')).toBeGreaterThan(0)
    expect(rough.most('bumpStrength')).toBeGreaterThan(0)
  })

  it('counts shifts and marks limiter cuts for the engine voice', () => {
    const pull = drive({}, () => ({ ...rest, throttle: 1 }), 6)
    expect(pull.read('shifts')).toBeGreaterThan(1)
    expect(pull.most('cutting')).toBe(0)
    const held = drive({}, () => ({ ...rest, throttle: 1, manual: true }), 8)
    expect(held.most('cutting')).toBe(1)
    expect(held.read('clunk')).toBe(1)
  })
})
