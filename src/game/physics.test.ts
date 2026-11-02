import { describe, expect, test } from 'bun:test'
import { resolveInput } from './controls'
import { CarPhysics, type Input } from './physics'
import { SimulationClock } from './simulation-clock'
import { defaults, type Settings, World } from './world'

class FlatWorld extends World {
  override road(_s: number) {
    return { x: 0, y: 0, dx: 0, dy: 0, yaw: 0 }
  }
}

class OpposingBends extends World {
  override road(s: number) {
    const angle = ((s - 180) * 2 * Math.PI) / 65
    const dx = ((7 * 2 * Math.PI) / 65) * Math.sin(angle)
    return { x: 7 * (1 - Math.cos(angle)), y: 0, dx, dy: 0, yaw: Math.atan2(-dx, 1) }
  }
}

class GradeWorld extends World {
  constructor(
    settings: Settings,
    public grade: number,
  ) {
    super(settings)
  }
  override road(s: number) {
    return { x: 0, y: s * this.grade, dx: 0, dy: this.grade, yaw: 0 }
  }
  override surface(_x: number, s: number) {
    return { height: s * this.grade, onRoad: true, slopeX: 0, slopeS: this.grade }
  }
  override guardrail(_s: number, _side: number) {
    return false
  }
}

class GuardrailWorld extends World {
  constructor(
    settings: Settings,
    public gradient = 0,
    public rails = true,
  ) {
    super(settings)
  }
  override road(s: number) {
    return {
      x: this.gradient * s,
      y: 0,
      dx: this.gradient,
      dy: 0,
      yaw: Math.atan2(-this.gradient, 1),
    }
  }
  override surface(_x: number, _s: number) {
    return { height: 0, onRoad: true, slopeX: 0, slopeS: 0 }
  }
  override guardrail(_s: number, _side: number) {
    return this.rails
  }
}

const coast: Input = {
  throttle: 0,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}
function simulate(
  car: CarPhysics,
  duration: number,
  input: Input = coast,
  dt = 1 / 120,
  settings: Settings = defaults,
) {
  for (let t = 0; t < duration; t += dt) car.update(dt, input, settings)
}

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s resets on the centerline and autosteer recovers from either side',
  (vehicle) => {
    const settings = { ...defaults, vehicle }
    for (const offset of [-1.2, 1.2]) {
      const car = new CarPhysics(new FlatWorld(settings))
      expect(car.x).toBe(car.world.road(car.s).x)
      car.x += offset
      car.speed = 15
      car.suspension.reset(car)
      for (let step = 0; step < 30 * 120; step++) {
        car.update(1 / 120, car.autoInput(15), settings)
        expect(Math.abs(car.x)).toBeLessThan(1.21)
        expect(car.offroad).toBe(false)
      }
      expect(Math.abs(car.x)).toBeLessThan(0.02)
    }
  },
)

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s autosteer recovers after taking over a moving digital rack',
  (vehicle) => {
    const settings = { ...defaults, vehicle }
    const car = new CarPhysics(new World(settings))
    car.speed = 18
    for (let step = 0; step < 120; step++) car.update(1 / 120, car.autoInput(18), settings)
    for (let step = 0; step < 24; step++) {
      const manual: Input = { ...coast, steer: 0.3, steeringSource: 'digital' }
      car.update(1 / 120, resolveInput(manual, car.autoInput(18), 'speed', false), settings)
    }
    expect(car.steeringControl.source).toBe('digital')
    expect(Math.abs(car.steeringControl.rate)).toBeGreaterThan(0.01)
    for (let step = 0; step < 60 * 120; step++) {
      car.update(1 / 120, car.autoInput(18), settings)
      expect(car.offroad).toBe(false)
      expect(car.impact).toBeLessThan(0.99)
    }
    expect(car.steeringControl.source).toBe('automatic')
    expect(car.distance).toBeGreaterThan(900)
  },
)

test('reset clears a moving mouse rack and its filtered command', () => {
  const settings = { ...defaults }
  const car = new CarPhysics(new FlatWorld(settings))
  simulate(car, 0.1, { ...coast, steer: 1, steeringSource: 'mouse' })
  expect(car.steering).toBeGreaterThan(0.1)
  car.reset()
  simulate(car, 1, coast)
  expect(car.steering).toBe(0)
  expect(car.steeringControl.rate).toBe(0)
  expect(car.steeringControl.mouseCommand).toBe(0)
})

describe('brake priority after powered acceleration', () => {
  for (const vehicle of ['touring', 'roadster', 'motorcycle', 'bus'] as const)
    test.each([
      { name: 'service brake', throttle: 0, brake: 1, regenBrake: 0 },
      { name: 'one-pedal brake', throttle: 0, brake: 0, regenBrake: 0.15 },
      { name: 'simultaneous pedals', throttle: 1, brake: 1, regenBrake: 0 },
    ])(`${vehicle} slows immediately with $name`, ({ throttle, brake, regenBrake }) => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      simulate(car, 4, { ...coast, throttle: 1 }, 1 / 120, settings)
      expect(car.speed).toBeGreaterThan(5)
      expect(car.driveForce).toBeGreaterThan(0)
      for (let step = 0; step < 30; step++) {
        const previous = car.speed
        car.update(1 / 120, { ...coast, throttle, brake, regenBrake }, settings)
        expect(car.speed).toBeLessThanOrEqual(previous)
        if (step === 0) expect(car.driveForce).toBeGreaterThan(0)
      }
    })
})

describe('service brake response', () => {
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s responds within a tenth of a second and releases without residual braking',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      car.speed = 20
      for (let step = 0; step < 12; step++) car.update(1 / 120, { ...coast, brake: 1 }, settings)
      const fullBrake = car.brakeForce
      expect(fullBrake).toBeGreaterThan(0)
      for (let step = 0; step < 12; step++) car.update(1 / 120, { ...coast, brake: 1 }, settings)
      expect(car.brakeForce).toBeCloseTo(fullBrake, 8)
      car.update(1 / 120, { ...coast, brake: 0.25 }, settings)
      expect(car.brakeForce).toBeCloseTo(fullBrake * 0.25, 8)
      car.update(1 / 120, coast, settings)
      expect(car.brakeForce).toBe(0)
    },
  )
  test('stops promptly from 72 km/h while retaining longer wet-road stopping distances', () => {
    const distances = { clear: 0, rain: 0 }
    for (const weather of ['clear', 'rain'] as const) {
      const settings = { ...defaults, weather }
      const stops = []
      for (const fps of [30, 60, 120, 240]) {
        const car = new CarPhysics(new FlatWorld(settings))
        const clock = new SimulationClock()
        car.speed = 20
        const start = car.s
        for (let frame = 0; frame < 5 * fps && car.speed > 0.05; frame++)
          clock.advance(1 / fps, (dt) => {
            if (car.speed > 0.05) car.update(dt, { ...coast, brake: 1 }, settings)
          })
        expect(car.speed).toBeLessThanOrEqual(0.05)
        stops.push(car.s - start)
      }
      expect(Math.max(...stops) - Math.min(...stops)).toBeLessThan(1e-8)
      distances[weather] = Math.max(...stops)
    }
    expect(distances.clear).toBeLessThan(25)
    expect(distances.rain).toBeLessThan(28.5)
    expect(distances.rain - distances.clear).toBeGreaterThan(2.5)
  })
})

describe('powered direction handoff', () => {
  for (const vehicle of ['touring', 'roadster', 'motorcycle', 'bus'] as const) {
    test(`${vehicle} slows accelerating reverse before driving forward`, () => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      simulate(car, 1, { ...coast, brake: 1 }, 1 / 120, settings)
      expect(car.speed).toBeLessThan(-0.5)
      expect(car.driveForce).toBeLessThan(0)
      const reverseSpeed = car.speed
      for (let step = 0; step < 300; step++) {
        const previous = car.speed
        car.update(1 / 120, { ...coast, throttle: 1 }, settings)
        expect(car.speed).toBeGreaterThanOrEqual(reverseSpeed)
        if (previous < -0.05) expect(car.speed).toBeGreaterThanOrEqual(previous - 1e-10)
      }
      expect(car.speed).toBeGreaterThan(0)
    })
    test(`${vehicle} cannot receive a forward kick when reverse is selected near rest`, () => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      for (let step = 0; step < 120 && car.speed < 0.2; step++)
        car.update(1 / 120, { ...coast, throttle: 1 }, settings)
      expect(car.speed).toBeGreaterThanOrEqual(0.2)
      expect(car.driveForce).toBeGreaterThan(0)
      const forwardSpeed = car.speed
      for (let step = 0; step < 120; step++) {
        const previous = car.speed
        car.update(1 / 120, { ...coast, brake: 1 }, settings)
        expect(car.speed).toBeLessThanOrEqual(forwardSpeed)
        if (previous > 0.05) expect(car.speed).toBeLessThanOrEqual(previous + 1e-10)
      }
      expect(car.speed).toBeLessThan(0)
    })
    test.each([0.05, 0.1, 0.2, -0.1])(
      `${vehicle} completes a reverse-to-forward change on grade %f`,
      (grade) => {
        const settings = { ...defaults, vehicle }
        const car = new CarPhysics(new GradeWorld(settings, grade))
        simulate(car, 1, { ...coast, brake: 1 }, 1 / 120, settings)
        let forward = false
        for (let step = 0; step < 2400; step++) {
          car.update(1 / 120, { ...coast, throttle: 1 }, settings)
          if (forward) expect(car.speed).toBeGreaterThan(-0.01)
          forward ||= car.speed > 0.1
        }
        expect(forward).toBe(true)
      },
    )
    test(`${vehicle} completes the handoff on the generated curved road`, () => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new World(settings))
      simulate(car, 1, { ...coast, brake: 1 }, 1 / 120, settings)
      simulate(car, 3, { ...coast, throttle: 1 }, 1 / 120, settings)
      expect(car.speed).toBeGreaterThan(0.1)
    })
  }
})

function railContact(
  side: number,
  yaw: number,
  gradient: number,
  normalSpeed: number,
  tangentSpeed: number,
  rails = true,
) {
  const car = new CarPhysics(new GuardrailWorld({ ...defaults }, gradient, rails))
  const road = car.world.road(car.s)
  car.x = road.x + side * 5.3491
  car.yaw = road.yaw + yaw
  const length = Math.hypot(1, gradient)
  const velocityX = (side * normalSpeed + gradient * tangentSpeed) / length
  const velocityS = (-side * gradient * normalSpeed + tangentSpeed) / length
  car.speed = -Math.sin(car.yaw) * velocityX + Math.cos(car.yaw) * velocityS
  car.lateralSpeed = Math.cos(car.yaw) * velocityX + Math.sin(car.yaw) * velocityS
  car.update(1 / 120, coast, defaults)
  const worldX = -Math.sin(car.yaw) * car.speed + Math.cos(car.yaw) * car.lateralSpeed
  const worldS = Math.cos(car.yaw) * car.speed + Math.sin(car.yaw) * car.lateralSpeed
  return {
    car,
    normal: (side * (worldX - gradient * worldS)) / length,
    tangent: (gradient * worldX + worldS) / length,
    energy: car.speed * car.speed + car.lateralSpeed * car.lateralSpeed,
  }
}

describe('guardrail response', () => {
  test.each([-1, 1])('a gentle contact on side %i cannot inject kinetic energy', (side) => {
    const free = railContact(side, 0, 0, 0.2, 0, false)
    const contact = railContact(side, 0, 0, 0.2, 0)
    expect(contact.car.impact).toBeGreaterThan(0)
    expect(contact.car.impact).toBeLessThan(0.05)
    expect(contact.energy).toBeLessThan(free.energy)
    expect(contact.normal).toBeLessThan(0)
    expect(Math.abs(contact.normal)).toBeLessThan(free.normal)
  })
  test('a glancing impact preserves tangential motion and dissipates normal motion', () => {
    for (const side of [-1, 1])
      for (const gradient of [-0.4, 0.4])
        for (const yaw of [0, Math.PI, -Math.PI / 2, Math.PI / 2]) {
          const free = railContact(side, yaw, gradient, 2, 3, false)
          const contact = railContact(side, yaw, gradient, 2, 3)
          expect(contact.car.impact).toBeGreaterThan(0)
          expect(contact.tangent).toBeCloseTo(free.tangent, 8)
          expect(contact.normal).toBeCloseTo(-free.normal * 0.15, 8)
          expect(contact.car.yaw).toBeCloseTo(free.car.yaw, 8)
          expect(contact.energy).toBeLessThanOrEqual(free.energy)
        }
  })
  test('impact feedback scales with approach speed rather than glancing speed', () => {
    const gentle = railContact(1, 0, 0, 0.2, 0)
    const faster = railContact(1, 0, 0, 2, 0)
    const glancing = railContact(1, 0, 0, 2, 30)
    expect(faster.car.impact).toBeGreaterThan(gentle.car.impact * 5)
    expect(glancing.car.impact).toBeCloseTo(faster.car.impact, 3)
    expect(glancing.tangent).toBeGreaterThan(29)
  })
})

describe('vehicle dynamics', () => {
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s coasts downhill equally while facing forward or backward',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const backward = new CarPhysics(new GradeWorld(settings, 0.1))
      const forward = new CarPhysics(new GradeWorld(settings, 0.1))
      forward.yaw = Math.PI
      forward.suspension.reset(forward)
      simulate(backward, 20, coast, 1 / 120, settings)
      simulate(forward, 20, coast, 1 / 120, settings)
      expect(backward.speed).toBeLessThan(-5)
      expect(Math.abs(backward.speed + forward.speed)).toBeLessThan(0.001)
      expect(Math.abs(backward.s - forward.s)).toBeLessThan(0.01)
    },
  )
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s governs powered reverse and responds to forward throttle',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      for (const dt of [1 / 60, 1 / 120]) {
        const car = new CarPhysics(new FlatWorld(settings))
        let reversePeak = 0
        for (let step = 0; step < 30 / dt; step++) {
          car.update(dt, { ...coast, brake: 1 }, settings)
          reversePeak = Math.min(reversePeak, car.speed)
        }
        expect(car.speed).toBeLessThan(-4.7)
        expect(reversePeak).toBeGreaterThanOrEqual(-5)
        simulate(car, 6, { ...coast, throttle: 1 }, dt, settings)
        expect(car.speed).toBeGreaterThan(10)
        expect(car.telemetry().gear).not.toBe('R')
      }
    },
  )
  test('the reverse governor cannot brake or clip unpowered downhill motion', () => {
    const settings = { ...defaults }
    const free = new CarPhysics(new GradeWorld(settings, 0.1))
    const governed = new CarPhysics(new GradeWorld(settings, 0.1))
    free.speed = governed.speed = -9
    simulate(free, 2)
    simulate(governed, 2, { ...coast, brake: 1 })
    expect(governed.speed).toBeLessThan(-9)
    expect(governed.speed).toBeCloseTo(free.speed, 8)
    expect(governed.s).toBeCloseTo(free.s, 8)
  })
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s retains full braking before transitioning into reverse',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new FlatWorld(settings))
      car.speed = 20
      let stoppingTime: number | null = null
      let stoppingDistance = 0
      for (let step = 0; step < 120 * 8; step++) {
        car.update(1 / 120, { ...coast, brake: 1 }, settings)
        if (stoppingTime === null && car.speed <= 0) {
          stoppingTime = step / 120
          stoppingDistance = car.distance
        }
      }
      expect(stoppingTime).not.toBeNull()
      expect(stoppingTime).toBeLessThan(6)
      expect(stoppingDistance).toBeLessThan(80)
      expect(car.speed).toBeLessThan(-1)
    },
  )
  test('autodrive sees opposing bends even when their net heading change cancels', () => {
    const car = new CarPhysics(new OpposingBends({ ...defaults }))
    car.speed = 20
    expect(car.world.road(car.s).yaw).toBeCloseTo(car.world.road(car.s + 65).yaw, 8)
    expect(car.routeSpeed(45)).toBeLessThan(12)
    expect(car.autoInput(45).throttle).toBe(0)
    expect(car.autoInput(45).brake).toBeGreaterThan(0)
  })
  test('autodrive plans braking before reaching a bend', () => {
    class UpcomingBend extends World {
      override road(s: number) {
        const distance = Math.max(0, s - 280)
        const dx = distance / 50
        return { x: (distance * distance) / 100, y: 0, dx, dy: 0, yaw: Math.atan2(-dx, 1) }
      }
    }
    const car = new CarPhysics(new UpcomingBend({ ...defaults }))
    car.reset(230)
    car.speed = 30
    expect(car.world.road(car.s + 20).dx).toBe(0)
    expect(car.routeSpeed(45)).toBeLessThan(car.speed)
    expect(car.autoInput(45).brake).toBeGreaterThan(0)
  })
  test('the same corner gets a lower assisted speed with less grip or ice', () => {
    const dry = new CarPhysics(new OpposingBends({ ...defaults }))
    const slippery = new CarPhysics(new OpposingBends({ ...defaults, grip: 0.2 }))
    const icy = new CarPhysics(new OpposingBends({ ...defaults, grip: 0.2, season: 'winter' }))
    expect(slippery.routeSpeed(45)).toBeLessThan(dry.routeSpeed(45))
    expect(icy.routeSpeed(45)).toBeLessThan(slippery.routeSpeed(45))
    expect(dry.world.settings.cruiseSpeed).toBe(defaults.cruiseSpeed)
  })
  test('assisted corner planning uses the reduced traction of a wet road', () => {
    const dry = new CarPhysics(new OpposingBends({ ...defaults, grip: 0.5 }))
    const wet = new CarPhysics(new OpposingBends({ ...defaults, grip: 0.5, weather: 'rain' }))
    expect(wet.routeSpeed(45)).toBeLessThan(dry.routeSpeed(45) * 0.9)
    expect(wet.world.settings.cruiseSpeed).toBe(defaults.cruiseSpeed)
  })
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s autodrive reserves steering traction in rain',
    (vehicle) => {
      for (const grip of [0.2, 1]) {
        const settings: Settings = { ...defaults, vehicle, grip, weather: 'rain', cruiseSpeed: 45 }
        const car = new CarPhysics(new World(settings))
        let leftRoad = false,
          collided = false
        for (let step = 0; step < 120 * 120; step++) {
          car.update(1 / 120, car.autoInput(settings.cruiseSpeed), settings)
          leftRoad ||= car.offroad
          collided ||= car.impact > 0.99
        }
        expect({ grip, leftRoad, collided }).toEqual({ grip, leftRoad: false, collided: false })
        expect(car.distance).toBeGreaterThan(600)
      }
    },
  )
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s autodrive handles maximum cruise across traction and terrain extremes',
    (vehicle) => {
      for (const grip of [0.2, 1, 2])
        for (const season of ['summer', 'winter'] as const)
          for (const landscape of ['highlands', 'alpine', 'desert'] as const)
            for (const seed of [42, 43, 99]) {
              const power = seed === 42 ? 2 : seed === 43 ? 0.5 : 1
              const settings: Settings = {
                ...defaults,
                vehicle,
                grip,
                season,
                landscape,
                seed,
                power,
                cruiseSpeed: 45,
              }
              const car = new CarPhysics(new World(settings))
              let leftRoad = false,
                collided = false,
                finite = true
              for (let step = 0; step < 120 * 180; step++) {
                car.update(1 / 120, car.autoInput(settings.cruiseSpeed), settings)
                leftRoad ||= car.offroad
                collided ||= car.impact > 0.99
                finite &&= Number.isFinite(car.x + car.y + car.s + car.speed)
              }
              const scenario = { grip, season, landscape, seed, power }
              expect({
                scenario,
                leftRoad,
                collided,
                finite,
                progressed: car.distance > 1000,
              }).toEqual({
                scenario,
                leftRoad: false,
                collided: false,
                finite: true,
                progressed: true,
              })
              expect(settings.cruiseSpeed).toBe(45)
            }
    },
    30000,
  )
  test('one-pedal braking stops without selecting reverse', () => {
    const free = new CarPhysics(new FlatWorld({ ...defaults }))
    const braking = new CarPhysics(new FlatWorld({ ...defaults }))
    free.speed = braking.speed = 15
    simulate(free, 18)
    simulate(braking, 18, { ...coast, regenBrake: 0.15 })
    expect(braking.distance).toBeLessThan(free.distance)
    expect(braking.speed).toBeGreaterThanOrEqual(-0.000001)
    expect(braking.speed).toBeLessThan(0.01)
  })
  test('accelerates, coasts, and brakes with distinct stopping forces', () => {
    const car = new CarPhysics(new FlatWorld({ ...defaults }))
    simulate(car, 4, { ...coast, throttle: 1 })
    expect(car.speed).toBeGreaterThan(12)
    const speed = car.speed
    simulate(car, 1)
    expect(car.speed).toBeLessThan(speed)
    const rollingLoss = speed - car.speed
    simulate(car, 1, { ...coast, brake: 1 })
    expect(speed - rollingLoss - car.speed).toBeGreaterThan(rollingLoss * 3)
  })
  test('handles reverse without producing invalid state', () => {
    const car = new CarPhysics(new FlatWorld({ ...defaults }))
    simulate(car, 3, { ...coast, brake: 1 })
    expect(car.speed).toBeLessThan(0)
    expect(car.telemetry().gear).toBe('R')
    expect(Number.isFinite(car.x + car.y + car.s)).toBe(true)
  })
  test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
    '%s autodrive follows several kilometers of generated curves',
    (vehicle) => {
      const settings = { ...defaults, vehicle }
      const car = new CarPhysics(new World(settings))
      for (let i = 0; i < 120 * 240; i++) car.update(1 / 120, car.autoInput(24), settings)
      expect(car.distance).toBeGreaterThan(4500)
      expect(Math.abs(car.x - car.world.road(car.s).x)).toBeLessThan(4.5)
      expect(car.offroad).toBe(false)
    },
  )
  test('gives similar results at different simulation rates', () => {
    const a = new CarPhysics(new FlatWorld({ ...defaults }))
    const b = new CarPhysics(new FlatWorld({ ...defaults }))
    simulate(a, 3, { ...coast, throttle: 1 }, 1 / 60)
    simulate(b, 3, { ...coast, throttle: 1 }, 1 / 120)
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(0.15)
    expect(Math.abs(a.distance - b.distance)).toBeLessThan(0.4)
  })
  test.each([42, 43, 99])('winter bus stays on the road for ten minutes with seed %i', (seed) => {
    const settings: Settings = { ...defaults, seed, season: 'winter', vehicle: 'bus' }
    const car = new CarPhysics(new World(settings))
    let leftRoad = false,
      collided = false
    for (let i = 0; i < 120 * 600; i++) {
      car.update(1 / 120, car.autoInput(24), settings)
      leftRoad ||= car.offroad
      collided ||= car.impact > 0.99
    }
    expect(leftRoad).toBe(false)
    expect(collided).toBe(false)
    expect(car.distance).toBeGreaterThan(12000)
  })
})

test('motorcycle ignores the handbrake while retaining service brakes', () => {
  const settings = { ...defaults, vehicle: 'motorcycle' as const }
  const free = new CarPhysics(new FlatWorld(settings))
  const handbrake = new CarPhysics(new FlatWorld(settings))
  const braking = new CarPhysics(new FlatWorld(settings))
  for (const bike of [free, handbrake, braking]) bike.speed = 15
  simulate(free, 1, coast, 1 / 120, settings)
  simulate(handbrake, 1, { ...coast, handbrake: true }, 1 / 120, settings)
  simulate(braking, 1, { ...coast, brake: 1 }, 1 / 120, settings)
  expect(handbrake.speed).toBeCloseTo(free.speed, 8)
  expect(braking.speed).toBeLessThan(free.speed - 5)
})
describe('world continuity', () => {
  test('road joins stay smooth at streaming boundaries far from the origin', () => {
    const world = new World({ ...defaults })
    for (const s of [0, 120, 240, 1200, 12000, 100000]) {
      const a = world.road(s - 0.001)
      const b = world.road(s + 0.001)
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.005)
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.005)
      expect(Math.abs(world.height(b.x, s + 0.001) + 0.16 - b.y)).toBeLessThan(0.001)
    }
  })
})

test('different vehicles reach distinct natural cruising limits', () => {
  const speeds: number[] = []
  for (const vehicle of ['touring', 'bus'] as const) {
    const settings = { ...defaults, vehicle }
    const car = new CarPhysics(new FlatWorld(settings))
    for (let i = 0; i < 120 * 90; i++) car.update(1 / 120, { ...coast, throttle: 1 }, settings)
    speeds.push(car.speed)
  }
  expect(speeds[0]).toBeGreaterThan(40)
  expect(speeds[0]).toBeLessThan(50)
  expect(speeds[1]).toBeGreaterThan(27)
  expect(speeds[1]).toBeLessThan(35)
})
