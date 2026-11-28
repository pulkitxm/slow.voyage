import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { brakeTypes } from './brakes'
import {
  bodyChassis,
  bodyFootprint,
  bodyFor,
  bodyMetrics,
  bodyNamed,
  bodyTire,
  carBodies,
  carSlug,
  readTyre,
  wheelGeometry,
  withholdBodies,
} from './car-bodies'
import sheets from './car-sheets.json'
import { footprints } from './collision'
import { engineCars } from './engine-catalog'
import { carNitro, classNitro, fitCar, fitEngine, terminalSpeed } from './engines'
import { decodeSettings } from './settings'
import { Suspension } from './suspension'
import { vehicleMetrics } from './vehicles'
import { defaults, type Settings, World } from './world'

interface Glb {
  nodes: { name: string; translation?: number[]; scale?: number[]; mesh?: number }[]
  materials: { name: string }[]
  meshes: { name: string; primitives: { attributes: { POSITION: number } }[] }[]
  accessors: { min?: number[]; max?: number[]; normalized?: boolean; componentType: number }[]
}

const folder = resolve(import.meta.dir, '../assets/models/cars/bodies')

async function readGlb(id: string) {
  const bytes = await Bun.file(`${folder}/${id}.glb`).arrayBuffer()
  const view = new DataView(bytes)
  const length = view.getUint32(12, true)
  return {
    size: bytes.byteLength,
    json: JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length))) as Glb,
  }
}

function bounds(json: Glb) {
  const low = [Infinity, Infinity, Infinity]
  const high = [-Infinity, -Infinity, -Infinity]
  for (const node of json.nodes) {
    const mesh = node.mesh === undefined ? undefined : json.meshes[node.mesh]
    if (!mesh) continue
    for (const primitive of mesh.primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION]
      if (!accessor?.min || !accessor.max) continue
      const unit = accessor.normalized ? (accessor.componentType === 5122 ? 32767 : 127) : 1
      for (let axis = 0; axis < 3; axis++) {
        const scale = node.scale?.[axis] ?? 1
        const shift = node.translation?.[axis] ?? 0
        const ends = [accessor.min[axis] ?? 0, accessor.max[axis] ?? 0].map(
          (value) => (value / unit) * scale + shift,
        )
        low[axis] = Math.min(low[axis] ?? 0, ...ends)
        high[axis] = Math.max(high[axis] ?? 0, ...ends)
      }
    }
  }
  return { low, high }
}

const car = (name: string): Settings => {
  const body = bodyNamed(name)
  if (!body) throw new Error(`${name} has no body`)
  return {
    ...defaults,
    vehicle: body.chassis,
    engine: body.engine,
    engineCar: name,
    engineView: 'car',
  }
}

afterEach(() => withholdBodies(false))

describe('car sheets', () => {
  test('every car in the engine catalog has a sheet under its own id', () => {
    expect(carBodies.length).toBe(engineCars.length)
    expect(new Set(carBodies.map((body) => body.id)).size).toBe(carBodies.length)
    expect(Object.keys(sheets).sort()).toEqual(carBodies.map((body) => body.id).sort())
  })

  test('ids are plain lowercase words', () => {
    expect(carSlug('Škoda Octavia RS')).toBe('skoda-octavia-rs')
    expect(carSlug('Nissan Skyline GT-R (R34)')).toBe('nissan-skyline-gt-r-r34')
    expect(carSlug('Chevrolet Camaro Z/28')).toBe('chevrolet-camaro-z-28')
    expect(carSlug('Bugatti Chiron Super Sport 300+')).toBe('bugatti-chiron-super-sport-300')
    for (const body of carBodies) expect(body.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  test('every sheet says which of its figures are estimates', () => {
    const fields = [
      'length',
      'width',
      'height',
      'wheelbase',
      'frontOverhang',
      'track',
      'tyres',
      'clearance',
      'mass',
      'frontWeight',
    ]
    for (const sheet of Object.values(sheets))
      for (const field of sheet.estimated) expect(fields).toContain(field)
  })

  test('tyre sizes read as road and racing sizes', () => {
    const road = readTyre('245/35R20')
    expect(road.width).toBeCloseTo(0.245, 5)
    expect(road.rim).toBeCloseTo(0.254, 5)
    expect(road.radius).toBeCloseTo(0.33975, 5)
    const race = readTyre('660x355R13')
    expect(race.radius).toBeCloseTo(0.33, 5)
    expect(race.width).toBeCloseTo(0.355, 5)
    expect(() => readTyre('large')).toThrow()
  })

  test.each(carBodies.map((body) => [body.id, body] as const))(
    '%s is a believable car',
    (_, body) => {
      expect(bodyChassis).toContain(body.chassis)
      expect(body.length).toBeGreaterThan(3.5)
      expect(body.length).toBeLessThan(6.2)
      expect(body.width).toBeGreaterThan(1.6)
      expect(body.width).toBeLessThan(2.3)
      expect(body.height).toBeGreaterThan(0.9)
      expect(body.height).toBeLessThan(2.1)
      expect(body.wheelbase).toBeLessThan(body.length - 1)
      expect(body.frontOverhang).toBeGreaterThan(0.6)
      expect(body.length - body.wheelbase - body.frontOverhang).toBeGreaterThan(0.4)
      for (const [axle, tyre] of body.tyres.entries()) {
        expect(tyre.radius).toBeGreaterThan(0.28)
        expect(tyre.radius).toBeLessThan(0.48)
        expect(tyre.rim).toBeLessThan(tyre.radius - 0.05)
        expect((body.track[axle] ?? 0) + tyre.width).toBeLessThan(body.width + 0.06)
      }
      expect(body.paint).toMatch(/^#[0-9a-f]{6}$/)
    },
  )
})

describe('car models', () => {
  test.each(carBodies.map((body) => [body.id, body] as const))(
    '%s has a model built to its sheet',
    async (id, body) => {
      expect(existsSync(`${folder}/${id}.glb`)).toBe(true)
      const { size, json } = await readGlb(id)
      expect(size).toBeLessThan(380_000)
      expect(json.materials.map((material) => material.name)).toContain('body')
      expect(json.nodes.some((node) => /^Taillights/.test(node.name))).toBe(true)
      const shell = json.meshes.find((mesh) => mesh.name === 'Coachwork' || mesh.name === 'Body')
      expect(shell?.primitives[0]?.attributes).toHaveProperty('COLOR_0')
      const wheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].map((name) =>
        json.nodes.find((node) => node.name === name),
      )
      for (const [index, wheel] of wheels.entries()) {
        const axle = index < 2 ? 0 : 1
        const [x = 0, y = 0, z = 0] = wheel?.translation ?? []
        expect(Math.abs(Math.abs(x) - (body.track[axle] ?? 0) / 2)).toBeLessThan(0.012)
        expect(y).toBeCloseTo(body.tyres[axle]?.radius ?? 0, 2)
        expect(z).toBeCloseTo((axle ? -1 : 1) * (body.wheelbase / 2), 2)
        expect(Math.sign(x)).toBe(index % 2 ? -1 : 1)
      }
      const { low, high } = bounds(json)
      const length = (high[2] ?? 0) - (low[2] ?? 0)
      const width = (high[0] ?? 0) - (low[0] ?? 0)
      expect(Math.abs(length - body.length) / body.length).toBeLessThan(0.025)
      expect(Math.abs((high[1] ?? 0) - body.height) / body.height).toBeLessThan(0.04)
      expect(width).toBeGreaterThan(body.width * 0.95)
      expect(width).toBeLessThan(body.width + 0.5)
      expect(low[1] ?? 1).toBeGreaterThan(-0.01)
      expect(low[1] ?? 1).toBeLessThan(0.01)
      expect(high[2] ?? 0).toBeCloseTo(body.wheelbase / 2 + body.frontOverhang, 1)
    },
  )
})

describe('number plates', () => {
  test('each car carries its own plate in the same form', async () => {
    const { plateText } = await import('./coachwork')
    const plates = carBodies.map((body) => plateText(body.id))
    for (const plate of plates) expect(plate).toMatch(/^[A-Z]{2} \d{2} [A-Z]{3}$/)
    expect(new Set(plates).size).toBeGreaterThan(carBodies.length * 0.9)
    expect(plateText('ferrari-f8-tributo')).toBe(plateText('ferrari-f8-tributo'))
  })
})

describe('choosing a body', () => {
  test('a chosen car keeps its body on its own chassis, whatever engine it carries', () => {
    const golf = car('Volkswagen Golf GTI')
    expect(bodyFor(golf)?.id).toBe('volkswagen-golf-gti')
    expect(bodyFor({ ...golf, engine: 'ls70' })?.id).toBe('volkswagen-golf-gti')
    expect(bodyFor({ ...golf, engine: 'stock' })?.id).toBe('volkswagen-golf-gti')
    expect(bodyFor({ ...golf, vehicle: 'touring' })).toBeNull()
    expect(bodyFor({ ...golf, engineCar: '' })).toBeNull()
    expect(bodyFor({ ...golf, engineCar: 'Volkswagen Phaeton' })).toBeNull()
    expect(bodyFor(defaults)).toBeNull()
  })

  test('the bus and the motorcycle never take a car body', () => {
    for (const body of carBodies) {
      expect(body.chassis).not.toBe('bus')
      expect(body.chassis).not.toBe('motorcycle')
    }
  })

  test('software rendering keeps every vehicle as built', () => {
    const golf = car('Volkswagen Golf GTI')
    withholdBodies(true)
    expect(bodyFor(golf)).toBeNull()
    expect(fitCar(golf).metrics.wheelbase).toBe(vehicleMetrics.hatchback.wheelbase)
    withholdBodies(false)
    expect(bodyFor(golf)).not.toBeNull()
  })

  test('a saved car survives a reload', () => {
    const saved = car('Ferrari F8 Tributo')
    const loaded = decodeSettings(JSON.parse(JSON.stringify(saved)))
    expect(bodyFor(loaded)?.id).toBe('ferrari-f8-tributo')
  })
})

describe('body geometry', () => {
  test('a class vehicle with a swapped engine keeps its own body', () => {
    const swapped = { ...defaults, vehicle: 'supercar' as const, engine: 'w1680' as const }
    expect(bodyFor(swapped)).toBeNull()
    expect(fitCar(swapped)).toBe(fitEngine('supercar', 'w1680'))
    expect(fitCar(swapped).metrics.wheelbase).toBe(vehicleMetrics.supercar.wheelbase)
  })

  test('a body keeps its wheels inside its arches and its floor off the road', () => {
    for (const body of carBodies) {
      const stock = vehicleMetrics[body.chassis]
      const travel = bodyMetrics(stock, body).suspensionTravel
      expect(travel).toBeLessThanOrEqual(stock.suspensionTravel)
      expect(travel).toBeLessThanOrEqual(0.08)
      expect(travel).toBeGreaterThanOrEqual(0.025)
      if (body.clearance > 0.035) expect(travel).toBeLessThan(body.clearance)
    }
    const formula = bodyNamed('Ferrari F2004')
    if (!formula) throw new Error('no body')
    expect(bodyMetrics(vehicleMetrics.supercar, formula).suspensionTravel).toBeCloseTo(0.032, 3)
  })

  test('a body brings its own wheelbase, track, wheel size and travel and nothing else', () => {
    const settings = car('Ferrari F8 Tributo')
    const body = bodyFor(settings)
    if (!body) throw new Error('no body')
    const stock = vehicleMetrics.supercar
    const fitted = bodyMetrics(stock, body)
    expect(fitted.wheelbase).toBeCloseTo(2.65, 3)
    expect(fitted.trackWidth).toBeCloseTo((1.677 + 1.646) / 2, 3)
    expect(fitted.wheelRadius).toBeCloseTo((0.33975 + 0.3455) / 2, 4)
    const plain = { wheelbase: 0, trackWidth: 0, wheelRadius: 0, suspensionTravel: 0 }
    expect({ ...fitted, ...plain }).toEqual({ ...stock, ...plain })
    expect(bodyMetrics(stock, null)).toBe(stock)
  })

  test('every car reaches its own published top speed', () => {
    for (const body of carBodies) {
      const fitted = fitCar(car(body.name))
      expect(Math.abs(terminalSpeed(fitted.metrics) - body.topSpeed)).toBeLessThan(0.3)
      expect(fitted.metrics.maxSpeed).toBeCloseTo(body.topSpeed, 3)
    }
    expect(fitCar(car('Bugatti Chiron')).metrics.maxSpeed * 3.6).toBeCloseTo(420, 0)
    expect(fitCar(car('Ford Transit Connect')).metrics.maxSpeed * 3.6).toBeCloseTo(150, 0)
  })

  test('a swapped engine moves the top speed from the car, not the class', () => {
    const golf = car('Volkswagen Golf GTI')
    const own = fitCar(golf)
    const strong = fitCar({ ...golf, engine: 'w1680' })
    const weak = fitCar({ ...golf, engine: 'three10' })
    expect(strong.metrics.maxSpeed).toBeGreaterThan(own.metrics.maxSpeed)
    expect(weak.metrics.maxSpeed).toBeLessThan(own.metrics.maxSpeed)
    expect(strong.metrics.acceleration).toBeGreaterThan(own.metrics.acceleration)
    expect(strong.brakes).toBe(own.brakes)
    expect(strong.metrics.brake).toBe(own.metrics.brake)
    expect(fitCar(golf)).toBe(own)
  })

  test('lighter, more powerful cars pull harder and boost harder but shorter', () => {
    const fiesta = fitCar(car('Ford Fiesta EcoBoost'))
    const chiron = fitCar(car('Bugatti Chiron'))
    expect(chiron.metrics.acceleration).toBeGreaterThan(fiesta.metrics.acceleration * 1.8)
    expect(chiron.nitro.surge).toBeGreaterThan(fiesta.nitro.surge)
    expect(chiron.nitro.burn).toBeLessThan(fiesta.nitro.burn)
    for (const body of carBodies) {
      const { nitro } = fitCar(car(body.name))
      expect(nitro.surge).toBeGreaterThanOrEqual(carNitro.least)
      expect(nitro.surge).toBeLessThanOrEqual(carNitro.most)
      expect(nitro.burn).toBeGreaterThanOrEqual(carNitro.shortest)
      expect(nitro.burn).toBeLessThanOrEqual(carNitro.longest)
    }
    expect(fitEngine('touring', 'stock').nitro).toBe(classNitro)
  })

  test('each car stops with its own kind of brakes', () => {
    const transit = fitCar(car('Ford Transit Connect'))
    const golf = fitCar(car('Volkswagen Golf GTI'))
    const ferrari = fitCar(car('Ferrari F8 Tributo'))
    const formula = fitCar(car('Ferrari F2004'))
    expect([transit.brakes, golf.brakes, ferrari.brakes, formula.brakes]).toEqual([
      'drum',
      'vented',
      'ceramic',
      'carbon',
    ])
    expect(golf.metrics.brake).toBeGreaterThan(fitEngine('hatchback', 'stock').metrics.brake)
    expect(formula.metrics.brake).toBeGreaterThan(ferrari.metrics.brake)
    expect(fitEngine('supercar', 'stock').metrics.brake).toBe(vehicleMetrics.supercar.brake)
    for (const body of carBodies) expect(brakeTypes).toContain(body.brakes)
  })

  test('a body collides and casts its contact shadow at its own size', () => {
    const truck = car('Ford F-150 5.0')
    const print = bodyFootprint(truck)
    expect(print.front + print.rear).toBeCloseTo(5.89, 2)
    expect(print.halfWidth).toBeCloseTo(1.0145, 3)
    expect(bodyFootprint({ ...truck, engineCar: '' })).toBe(footprints.pickup)
    expect(bodyFootprint(defaults)).toBe(footprints.touring)
  })

  test('wheels sit on each axle with its own track and radius', () => {
    const body = bodyNamed('Porsche 911 GT3')
    if (!body) throw new Error('no body')
    const geometry = wheelGeometry('supercar', body)
    expect(geometry.track[0]).toBeGreaterThan(geometry.track[1])
    expect(geometry.radius[1]).toBeGreaterThan(geometry.radius[0])
    const stock = wheelGeometry('supercar', null)
    expect(stock.track).toEqual([
      vehicleMetrics.supercar.trackWidth,
      vehicleMetrics.supercar.trackWidth,
    ])
    const tire = bodyTire('supercar', body)
    expect(tire.width).toBeCloseTo((0.255 + 0.315) / 2, 3)
    expect(tire.tube).toBeGreaterThan(0.03)
    expect(tire.tube).toBeLessThan(0.06)
  })

  test('the suspension stands on the body wheelbase and track', () => {
    const settings = car('Ford F-150 5.0')
    const world = new World(settings)
    const suspension = new Suspension(world)
    const body = bodyFor(settings)
    if (!body) throw new Error('no body')
    expect(suspension.body).toBe(body)
    expect(suspension.wheels.length).toBe(4)
    for (const wheel of suspension.wheels) {
      expect(Math.abs(wheel.localS)).toBeCloseTo(body.wheelbase / 2, 5)
      expect(Math.abs(wheel.localX)).toBeCloseTo((body.track[0] + body.track[1]) / 4, 5)
    }
    suspension.configure('pickup')
    expect(suspension.body).toBeNull()
    expect(Math.abs(suspension.wheels[0]?.localS ?? 0)).toBeCloseTo(
      vehicleMetrics.pickup.wheelbase / 2,
      5,
    )
  })
})
