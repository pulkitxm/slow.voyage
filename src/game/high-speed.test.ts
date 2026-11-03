import { describe, expect, test } from 'bun:test'
import { automaticTarget, neutralInput, resolveInput } from './controls'
import { CarPhysics, type Input } from './physics'
import { roadCoordinates, roadLayout } from './road'
import { SimulationClock } from './simulation-clock'
import { vehicleMetrics } from './vehicles'
import { type AssistanceMode, defaults, type Settings, type Vehicle, World } from './world'

const vehicles = ['touring', 'roadster', 'motorcycle', 'bus'] as const
const routes = [
  { landscape: 'highlands', seed: 42 },
  { landscape: 'alpine', seed: 43 },
  { landscape: 'desert', seed: 99 },
] as const

class FlatWorld extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
}

interface Drive {
  vehicle: Vehicle
  route: (typeof routes)[number]
  mode: AssistanceMode
  manual: (time: number) => Input
  seconds: number
  speed?: number
  offset?: number
  yawError?: number
  frame?: (index: number) => number
}

function drive({
  vehicle,
  route,
  mode,
  manual,
  seconds,
  speed = 0,
  offset = 0,
  yawError = 0,
  frame,
}: Drive) {
  const settings: Settings = { ...defaults, vehicle, ...route, cruiseSpeed: 45 }
  const world = new World(settings)
  const car = new CarPhysics(world)
  car.reset(300)
  car.x += offset
  car.yaw = world.road(300).yaw + yawError
  car.speed = speed
  car.suspension.reset(car)
  const clock = new SimulationClock()
  const result = { maxOffset: 0, leftRoad: false, impact: 0, maxSlipOnRoad: 0, finite: true, car }
  let time = 0
  for (let index = 0; time < seconds; index++) {
    const elapsed = frame?.(index) ?? 1 / 60
    time += elapsed
    clock.advance(elapsed, (dt) => {
      const automatic = car.autoInput(automaticTarget(mode, settings.cruiseSpeed, vehicle))
      car.update(dt, resolveInput(manual(time), automatic, mode, false), settings)
      result.maxOffset = Math.max(
        result.maxOffset,
        Math.abs(roadCoordinates(world, car.x, car.s).distance),
      )
      result.leftRoad ||= car.offroad
      result.impact = Math.max(result.impact, car.impact)
      result.finite &&= Number.isFinite(car.x + car.s + car.y + car.speed + car.yawRate)
      if (!result.leftRoad && Math.abs(car.speed) > 5)
        result.maxSlipOnRoad = Math.max(
          result.maxSlipOnRoad,
          Math.abs(Math.atan2(car.lateralSpeed, Math.abs(car.speed))),
        )
    })
  }
  return result
}

const floored = () => ({ ...neutralInput, throttle: 1, boost: true })

describe('high-speed assistance', () => {
  test.each(vehicles)(
    '%s autosteer keeps the lane with the throttle and boost held down',
    (vehicle) => {
      for (const route of routes) {
        const run = drive({ vehicle, route, mode: 'steer', manual: floored, seconds: 75 })
        expect({ route, leftRoad: run.leftRoad, finite: run.finite }).toEqual({
          route,
          leftRoad: false,
          finite: true,
        })
        expect(run.impact).toBeLessThan(0.5)
        expect(run.car.distance).toBeGreaterThan(1500)
      }
    },
    30000,
  )

  test.each(vehicles)(
    '%s autodrive holds maximum cruise through long frame stalls',
    (vehicle) => {
      for (const route of routes) {
        const run = drive({
          vehicle,
          route,
          mode: 'full',
          manual: () => neutralInput,
          seconds: 60,
          frame: (index) => (index % 37 === 0 ? 0.2 : 1 / 60),
        })
        expect({ route, leftRoad: run.leftRoad }).toEqual({ route, leftRoad: false })
        expect(run.maxOffset).toBeLessThan(1.5)
      }
    },
    30000,
  )

  test.each(vehicles)(
    '%s assistance engaged at speed beside the lane before a tight bend recovers without spinning',
    (vehicle) => {
      for (const mode of ['full', 'steer'] as const)
        for (const route of routes) {
          const run = drive({
            vehicle,
            route,
            mode,
            manual: mode === 'steer' ? floored : () => neutralInput,
            seconds: 30,
            speed: 42,
            offset: 1.5,
            yawError: 0.05,
          })
          const margin = vehicle === 'motorcycle' ? roadLayout.shoulder + 0.25 : 0
          expect(run.maxOffset).toBeLessThan(roadLayout.halfWidth + margin)
          expect(run.impact).toBeLessThan(0.5)
          expect(Math.abs(run.car.yawRate)).toBeLessThan(0.5)
        }
    },
    30000,
  )
})

describe('high-speed manual handling', () => {
  const step = (time: number): Input => ({
    ...neutralInput,
    throttle: 1,
    steer: time > 2 && time < 3.5 ? 1 : 0,
    steeringSource: 'digital',
  })
  const slalom = (time: number): Input => ({
    ...neutralInput,
    throttle: 1,
    boost: true,
    steer: Math.sin(Math.PI * time),
    steeringSource: 'digital',
  })
  test.each(vehicles)(
    '%s full-lock inputs at 40 m/s never spin the vehicle on pavement',
    (vehicle) => {
      for (const manual of [step, slalom])
        for (const route of routes) {
          const run = drive({ vehicle, route, mode: 'off', manual, seconds: 8, speed: 40 })
          expect(run.finite).toBe(true)
          expect(run.maxSlipOnRoad).toBeLessThan(0.35)
        }
    },
  )

  test.each(vehicles)(
    '%s tires never ask for far more grip than exists while parking keeps full lock',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const metrics = vehicleMetrics[vehicle]
      for (const speed of [3, 33]) {
        const car = new CarPhysics(new FlatWorld(settings))
        car.speed = speed
        for (let step = 0; step < 90; step++)
          car.update(1 / 120, { ...neutralInput, steer: 1, steeringSource: 'digital' }, settings)
        const lateral =
          (car.speed * car.speed * Math.tan(Math.abs(car.steering))) / metrics.wheelbase
        if (speed === 3) expect(car.steering).toBeCloseTo(car.steeringControl.angle, 8)
        else {
          expect(car.steeringControl.angle).toBeGreaterThanOrEqual(car.steering)
          expect(lateral).toBeLessThan(9.81 * 1.6)
        }
      }
    },
  )

  test.each(vehicles)(
    '%s keyboard taps at highway speed nudge the car without leaving the lane',
    (vehicle) => {
      for (const route of routes)
        for (const direction of [-1, 1]) {
          const settings: Settings = { ...defaults, vehicle, ...route, cruiseSpeed: 33 }
          const world = new World(settings)
          const car = new CarPhysics(world)
          car.reset(900)
          car.speed = 33
          car.suspension.reset(car)
          for (let step = 0; step < 240; step++) car.update(1 / 120, car.autoInput(33), settings)
          let maxOffset = 0
          for (let step = 0; step < 6 * 120; step++) {
            const time = step / 120
            const manual: Input =
              time < 0.12
                ? { ...neutralInput, steer: direction, steeringSource: 'digital' }
                : neutralInput
            car.update(
              1 / 120,
              resolveInput(manual, car.autoInput(33), time < 0.4 ? 'speed' : 'full', false),
              settings,
            )
            maxOffset = Math.max(maxOffset, Math.abs(roadCoordinates(world, car.x, car.s).distance))
          }
          expect(maxOffset).toBeLessThan(2.2)
          expect(car.offroad).toBe(false)
        }
    },
  )

  test.each(vehicles)(
    '%s held keyboard steering reaches cornering grip promptly at speed',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      let reached = Number.POSITIVE_INFINITY
      for (let step = 0; step < 240 && reached === Number.POSITIVE_INFINITY; step++) {
        car.speed = 33
        car.update(1 / 120, { ...neutralInput, steer: 1, steeringSource: 'digital' }, settings)
        if (Math.abs(car.yawRate * car.speed) > 9.81 * 0.9) reached = step / 120
      }
      expect(reached).toBeLessThan(vehicle === 'touring' || vehicle === 'roadster' ? 0.5 : 0.95)
    },
  )

  test.each(vehicles)('%s keeps steering authority at full throttle and boost', (vehicle) => {
    const settings = { ...defaults, vehicle }
    const response = () => {
      const car = new CarPhysics(new FlatWorld(settings))
      car.speed = 29
      for (let step = 0; step < 60; step++)
        car.update(
          1 / 120,
          { ...neutralInput, throttle: 1, boost: true, steer: 0.11, steeringSource: 'automatic' },
          settings,
        )
      return (
        Math.abs(car.yawRate) /
        Math.abs((car.speed * Math.tan(car.steering)) / vehicleMetrics[vehicle].wheelbase)
      )
    }
    expect(response()).toBeGreaterThan(0.4)
  })
})

class GrassWorld extends FlatWorld {
  override surface(_x: number, _s: number) {
    return { height: 0, onRoad: false, sand: false, slopeX: 0, slopeS: 0 }
  }
}

describe('rough ground and flight', () => {
  test.each(vehicles)('%s full throttle on rough ground settles at a calm speed', (vehicle) => {
    const settings = { ...defaults, vehicle }
    const car = new CarPhysics(new GrassWorld(settings))
    car.speed = 40
    for (let step = 0; step < 20 * 120; step++)
      car.update(1 / 120, { ...neutralInput, throttle: 1 }, settings)
    expect(car.offroad).toBe(true)
    expect(car.speed).toBeGreaterThan(10)
    expect(car.speed).toBeLessThan(27)
  })

  test.each(vehicles)(
    '%s rotates back toward the ground before landing from a tumble',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      car.y += 12
      car.speed = 25
      car.pitch = 0.5
      car.pitchRate = 1.5
      if (vehicleMetrics[vehicle].trackWidth) {
        car.roll = -0.4
        car.rollRate = -2
      }
      car.suspension.updateOffsets(car)
      let landed = false
      for (let step = 0; step < 4 * 120 && !landed; step++) {
        car.update(1 / 120, neutralInput, settings)
        landed = car.suspension.wheels.some((wheel) => wheel.load > 0)
      }
      expect(landed).toBe(true)
      expect(Math.abs(car.pitch)).toBeLessThan(0.12)
      expect(Math.abs(car.roll)).toBeLessThan(0.12)
    },
  )
})

test.each(['touring', 'roadster', 'motorcycle'] as const)(
  '%s held keyboard steering builds most of its cornering within a fifth of a second at 90 km/h',
  (vehicle) => {
    const settings: Settings = { ...defaults, vehicle }
    const car = new CarPhysics(new FlatWorld(settings))
    car.reset(300)
    car.speed = 25
    car.suspension.reset(car)
    const trace: number[] = []
    while (trace.length < 60 && !car.offroad) {
      car.update(
        1 / 120,
        { ...neutralInput, throttle: 0.5, steer: 1, steeringSource: 'digital' },
        settings,
      )
      trace.push(Math.abs(car.yawRate * car.speed) / 9.81)
    }
    expect(trace.length).toBe(60)
    expect(trace[11]).toBeGreaterThan(0.3)
    expect(trace[23]).toBeGreaterThan(0.75)
  },
)
