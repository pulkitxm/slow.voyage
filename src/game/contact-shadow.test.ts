import { expect, test } from 'bun:test'
import { footprints } from './collision'
import { contactPatch, contactShade } from './contact-shadow'
import { neutralInput } from './controls'
import { CarPhysics } from './physics'
import { defaults, type Settings, World } from './world'

const vertices = (contactShade.columns + 1) * (contactShade.rows + 1)

test('the contact shadow drapes over rough ground instead of tilting with the body', () => {
  for (const landscape of ['highlands', 'alpine', 'canyon'] as const) {
    const settings: Settings = { ...defaults, vehicle: 'pickup', landscape }
    const world = new World(settings)
    const car = new CarPhysics(world)
    car.reset(1000)
    car.x = world.road(1000).x + 15
    car.y = world.height(car.x, 1000)
    car.speed = 10.5
    car.suspension.reset(car)
    const positions = new Float32Array(vertices * 3)
    const footprint = footprints.pickup
    let flatWorst = 0
    for (let step = 0; step < 1200; step++) {
      car.update(1 / 120, { ...neutralInput, throttle: car.speed < 10.5 ? 0.6 : 0 }, settings)
      if (step % 20) continue
      contactPatch(world, car, footprint, positions)
      for (let vertex = 0; vertex < vertices; vertex++) {
        const x = positions[vertex * 3] ?? 0
        const y = positions[vertex * 3 + 1] ?? 0
        const s = -(positions[vertex * 3 + 2] ?? 0)
        expect(Math.abs(y - contactShade.lift - world.surface(x, s).height)).toBeLessThan(0.02)
      }
      const reach = footprint.front * contactShade.margin
      const noseX = car.x - reach * Math.sin(car.yaw)
      const noseS = car.s + reach * Math.cos(car.yaw)
      const flat = car.y + contactShade.lift + reach * Math.sin(car.pitch)
      flatWorst = Math.max(flatWorst, Math.abs(flat - world.surface(noseX, noseS).height))
    }
    if (landscape !== 'highlands') expect(flatWorst).toBeGreaterThan(0.15)
  }
})

test('the patch spans the footprint with its margin, centred between the overhangs', () => {
  const flat = { surface: () => ({ height: 2 }) }
  const positions = new Float32Array(vertices * 3)
  const footprint = footprints.pickup
  const patch = contactPatch(flat, { x: 10, s: 100, y: 2, yaw: 0 }, footprint, positions)
  const xs: number[] = []
  const ss: number[] = []
  for (let vertex = 0; vertex < vertices; vertex++) {
    xs.push(positions[vertex * 3] ?? 0)
    ss.push(-(positions[vertex * 3 + 2] ?? 0))
    expect(positions[vertex * 3 + 1]).toBeCloseTo(2 + contactShade.lift, 5)
  }
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(
    footprint.halfWidth * 2 * contactShade.margin,
    4,
  )
  expect(Math.max(...ss) - Math.min(...ss)).toBeCloseTo(
    (footprint.front + footprint.rear) * contactShade.margin,
    4,
  )
  expect((Math.max(...ss) + Math.min(...ss)) / 2).toBeCloseTo(
    100 + (footprint.front - footprint.rear) / 2,
    4,
  )
  expect(patch.strength).toBe(1)
  const turned = new Float32Array(vertices * 3)
  contactPatch(flat, { x: 10, s: 100, y: 2, yaw: Math.PI / 2 }, footprint, turned)
  const turnedX: number[] = []
  for (let vertex = 0; vertex < vertices; vertex++) turnedX.push(turned[vertex * 3] ?? 0)
  expect(Math.max(...turnedX) - Math.min(...turnedX)).toBeCloseTo(
    (footprint.front + footprint.rear) * contactShade.margin,
    4,
  )
})

test('the shadow stays on the ground and fades as the car leaves it', () => {
  const flat = { surface: () => ({ height: 0 }) }
  const positions = new Float32Array(vertices * 3)
  const pose = { x: 0, s: 0, y: 0, yaw: 0 }
  const planted = contactPatch(flat, pose, footprints.touring, positions)
  const hopping = contactPatch(flat, { ...pose, y: 0.5 }, footprints.touring, positions)
  const flying = contactPatch(flat, { ...pose, y: 5 }, footprints.touring, positions)
  expect(positions[1]).toBeCloseTo(contactShade.lift, 5)
  expect(planted.strength).toBe(1)
  expect(hopping.strength).toBeLessThan(planted.strength)
  expect(hopping.strength).toBeGreaterThan(flying.strength)
  expect(flying.strength).toBe(contactShade.faintest)
})
