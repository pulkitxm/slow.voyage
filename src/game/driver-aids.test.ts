import { describe, expect, test } from 'bun:test'
import { CarPhysics, type Input } from './physics'
import { decodeSettings } from './settings'
import { breakaway, driven } from './tires'
import { vehicleMetrics } from './vehicles'
import { defaults, type Settings, type Vehicle, vehicles, World } from './world'

class FlatWorld extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
  override surface(_x: number, _s: number) {
    return { height: 0, onRoad: true, sand: false, slopeX: 0, slopeS: 0 }
  }
}

const coast: Input = {
  throttle: 0,
  boost: false,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}
const step = 1 / 120
const fourWheeled = vehicles.filter((vehicle) => vehicle !== 'motorcycle')
const overpoweredBrakes = vehicles.filter((vehicle) => vehicle !== 'bus')

function car(settings: Settings) {
  return new CarPhysics(new FlatWorld(settings))
}

function stop(settings: Settings, pedal = 1, steer = 0, kmh = 100) {
  const body = car(settings)
  body.speed = kmh / 3.6
  const start = body.s
  let skidding = 0,
    rearSkidding = 0,
    antilock = 0
  for (let frame = 0; frame < 120 * 10 && body.speed > 0.05; frame++) {
    body.update(
      step,
      { ...coast, brake: pedal, steer, steeringSource: steer ? 'analog' : null },
      settings,
    )
    if (body.suspension.wheels.some((wheel) => wheel.skidding)) skidding++
    if (body.suspension.wheels.some((wheel) => wheel.skidding && !wheel.front)) rearSkidding++
    if (body.telemetry().antilock) antilock++
  }
  return { distance: body.s - start, yaw: body.yaw, skidding, rearSkidding, antilock }
}

function launch(settings: Settings) {
  const body = car(settings)
  let time = 0,
    spinning = 0,
    traction = 0,
    turning = 0
  while (body.speed < 100 / 3.6 && time < 30) {
    body.update(step, { ...coast, throttle: 1 }, settings)
    if (body.suspension.wheels.some((wheel) => wheel.spinning)) spinning++
    if (body.telemetry().traction) traction++
    turning = Math.max(turning, ...body.suspension.wheels.map((wheel) => wheel.spin))
    time += step
  }
  return { time, spinning, traction, turning }
}

function corner(settings: Settings, speed: number, input: Partial<Input>, seconds: number) {
  const body = car(settings)
  body.speed = speed
  let slip = 0
  for (let frame = 0; frame < 120 * seconds; frame++) {
    body.update(step, { ...coast, steeringSource: 'analog', ...input }, settings)
    if (Math.abs(body.speed) > 2)
      slip = Math.max(slip, Math.abs(Math.atan2(body.lateralSpeed, Math.abs(body.speed))))
  }
  return { slip, yaw: body.yaw }
}

describe('drivetrain', () => {
  test.each(vehicles)('%s puts power through its driven wheels only', (vehicle) => {
    const settings = { ...defaults, vehicle }
    const body = car(settings)
    body.speed = 5
    for (let frame = 0; frame < 30; frame++) body.update(step, { ...coast, throttle: 1 }, settings)
    const layout = vehicleMetrics[vehicle].drivetrain
    for (const wheel of body.suspension.wheels)
      if (driven(layout, wheel)) expect(wheel.longitudinalImpulse).toBeGreaterThan(0)
      else expect(wheel.longitudinalImpulse).toBeLessThanOrEqual(0)
  })

  test('layouts follow the vehicles', () => {
    const layouts = Object.fromEntries(
      vehicles.map((vehicle) => [vehicle, vehicleMetrics[vehicle].drivetrain]),
    )
    expect(layouts).toEqual({
      touring: 'rear',
      roadster: 'rear',
      hatchback: 'front',
      supercar: 'all',
      pickup: 'all',
      motorcycle: 'rear',
      bus: 'rear',
    })
  })
})

describe('traction control', () => {
  test.each(vehicles)('%s never spins a wheel with traction control on', (vehicle) => {
    for (const weather of ['clear', 'rain'] as const) {
      const result = launch({ ...defaults, vehicle, weather })
      expect(result.spinning).toBe(0)
      expect(result.time).toBeLessThan(30)
    }
  })

  test.each(vehicles.filter((vehicle) => vehicle !== 'pickup'))(
    '%s spins its driven wheels on a wet launch without traction control and gets away slower',
    (vehicle) => {
      const settings: Settings = { ...defaults, vehicle, weather: 'rain' }
      const controlled = launch(settings)
      const loose = launch({ ...settings, tractionControl: false })
      expect(controlled.traction).toBeGreaterThan(0)
      expect(loose.traction).toBe(0)
      expect(loose.spinning).toBeGreaterThan(60)
      expect(loose.turning).toBe(breakaway.spinSurface)
      expect(loose.time).toBeGreaterThan(controlled.time + 0.3)
    },
  )

  test('a spinning rear axle loses sideways grip and stability control has to catch the tail', () => {
    const run = (tractionControl: boolean) => {
      const settings: Settings = { ...defaults, weather: 'rain', tractionControl }
      const body = car(settings)
      body.speed = 12
      let slide = 0,
        correction = 0
      for (let frame = 0; frame < 120 * 2; frame++) {
        body.update(step, { ...coast, throttle: 1, steer: 0.5, steeringSource: 'analog' }, settings)
        slide = Math.max(slide, Math.abs(body.lateralSpeed))
        correction += body.stability
      }
      return { slide, correction }
    }
    const controlled = run(true)
    const loose = run(false)
    expect(loose.slide).toBeGreaterThan(controlled.slide)
    expect(loose.correction).toBeGreaterThan(controlled.correction * 2)
  })

  test.each(['touring', 'roadster', 'motorcycle'] as Vehicle[])(
    '%s swings its tail wide under power in a bend without traction control, and is still caught',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const power = { throttle: 1, steer: 0.5 }
      const controlled = corner(settings, 12, power, 3)
      const loose = corner({ ...settings, tractionControl: false }, 12, power, 3)
      expect(controlled.slip).toBeLessThan(0.15)
      expect(loose.slip).toBeGreaterThan(0.25)
      expect(loose.slip).toBeLessThan(0.7)
    },
  )

  test('the front drive hatchback runs wide under power without traction control', () => {
    const settings: Settings = { ...defaults, vehicle: 'hatchback' }
    const power = { throttle: 1, steer: 0.5 }
    const controlled = corner(settings, 12, power, 3)
    const loose = corner({ ...settings, tractionControl: false }, 12, power, 3)
    expect(Math.abs(loose.yaw)).toBeLessThan(Math.abs(controlled.yaw) * 0.7)
  })

  test.each(vehicles)('%s corners tidily off the throttle with traction control off', (vehicle) => {
    for (const steer of [0.2, 0.4])
      expect(
        corner({ ...defaults, vehicle, tractionControl: false }, 25, { throttle: 0.3, steer }, 4)
          .slip,
      ).toBeLessThan(0.15)
  })
})

describe('antilock brakes', () => {
  test.each(overpoweredBrakes)(
    '%s locks its wheels and stops a quarter or more longer without antilock',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const assisted = stop(settings)
      const locked = stop({ ...settings, antilock: false })
      expect(assisted.skidding).toBe(0)
      expect(assisted.antilock).toBeGreaterThan(60)
      expect(locked.skidding).toBeGreaterThan(120)
      expect(locked.antilock).toBe(0)
      expect(locked.distance).toBeGreaterThan(assisted.distance * 1.2)
      expect(locked.distance).toBeLessThan(assisted.distance * 1.45)
    },
  )

  test.each(vehicles)('%s needs far more road on a wet road without antilock', (vehicle) => {
    const settings: Settings = { ...defaults, vehicle, weather: 'rain' }
    const assisted = stop(settings)
    const locked = stop({ ...settings, antilock: false })
    expect(locked.distance).toBeGreaterThan(assisted.distance * 1.35)
  })

  test.each(overpoweredBrakes.filter((vehicle) => vehicle !== 'motorcycle'))(
    '%s steers while braking with antilock but ploughs straight on locked wheels',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const assisted = stop(settings, 1, 0.6)
      const locked = stop({ ...settings, antilock: false }, 1, 0.6)
      expect(Math.abs(assisted.yaw)).toBeGreaterThan(1)
      expect(Math.abs(locked.yaw)).toBeLessThan(0.2)
    },
  )

  test('the bus brakes cannot lock its tyres on a dry road but can on snow', () => {
    const settings: Settings = { ...defaults, vehicle: 'bus', antilock: false }
    expect(stop(settings).skidding).toBe(0)
    expect(stop({ ...settings, season: 'winter' }).skidding).toBeGreaterThan(120)
  })

  test.each(vehicles)('%s antilock stays dark under gentle braking', (vehicle) => {
    expect(stop({ ...defaults, vehicle }, 0.2).antilock).toBe(0)
  })
})

describe('brake force distribution', () => {
  test.each(fourWheeled)(
    '%s stops sooner through a bend with fewer antilock interventions',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const shared = stop(settings, 0.5, 0.3, 80)
      const fixed = stop({ ...settings, brakeDistribution: false }, 0.5, 0.3, 80)
      expect(shared.distance).toBeLessThan(fixed.distance)
      expect(shared.antilock).toBeLessThan(fixed.antilock)
    },
  )

  test.each(fourWheeled)(
    '%s stops noticeably longer in a straight line without brake force distribution',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      expect(stop({ ...settings, brakeDistribution: false }).distance).toBeGreaterThan(
        stop(settings).distance * 1.05,
      )
    },
  )

  test.each(overpoweredBrakes)(
    '%s locks the front wheels first on the fixed split when antilock is off too',
    (vehicle) => {
      const fixed = stop({ ...defaults, vehicle, antilock: false, brakeDistribution: false })
      expect(fixed.skidding).toBeGreaterThan(60)
      expect(fixed.rearSkidding).toBe(0)
    },
  )
})

describe('stability control', () => {
  test('flashes through a violent lane change and keeps the car pointing straight', () => {
    const settings = { ...defaults }
    const body = new CarPhysics(new World(settings))
    body.speed = 30
    let lit = 0,
      slip = 0
    for (let frame = 0; frame < 120 * 4; frame++) {
      const steer = frame < 120 ? 1 : frame < 240 ? -1 : 0
      body.update(step, { ...coast, throttle: 0.5, steer, steeringSource: 'digital' }, settings)
      if (body.telemetry().stability) lit++
      slip = Math.max(slip, Math.abs(Math.atan2(body.lateralSpeed, Math.abs(body.speed))))
    }
    expect(lit).toBeGreaterThan(60)
    expect(slip).toBeLessThan(0.15)
  })

  test.each(['touring', 'hatchback', 'bus'] as Vehicle[])(
    '%s lamps stay dark on a calm autodrive',
    (vehicle) => {
      const settings: Settings = { ...defaults, vehicle }
      const body = new CarPhysics(new World(settings))
      let lit = 0
      for (let frame = 0; frame < 120 * 60; frame++) {
        body.update(step, body.autoInput(settings.cruiseSpeed), settings)
        const lamps = body.telemetry()
        if (frame > 120 * 5 && (lamps.antilock || lamps.traction || lamps.stability)) lit++
      }
      expect(lit).toBe(0)
    },
  )

  test.each(vehicles)(
    '%s stays on the road on autodrive in rain with every switchable aid off',
    (vehicle) => {
      const settings: Settings = {
        ...defaults,
        vehicle,
        weather: 'rain',
        cruiseSpeed: 45,
        antilock: false,
        brakeDistribution: false,
        tractionControl: false,
      }
      const body = new CarPhysics(new World(settings))
      let offroad = false
      for (let frame = 0; frame < 120 * 60; frame++) {
        body.update(step, body.autoInput(settings.cruiseSpeed), settings)
        offroad ||= body.offroad
      }
      expect(offroad).toBe(false)
      expect(body.distance).toBeGreaterThan(1000)
    },
  )
})

test('driver aids default on and keep a stored choice', () => {
  expect(decodeSettings({})).toMatchObject({
    antilock: true,
    brakeDistribution: true,
    tractionControl: true,
  })
  expect(
    decodeSettings({ antilock: false, brakeDistribution: false, tractionControl: 'no' }),
  ).toMatchObject({ antilock: false, brakeDistribution: false, tractionControl: true })
})
