import { expect, test } from 'bun:test'
import { Matrix4, Object3D, Vector3 } from 'three'
import { footprints } from './collision'
import { contactPatch, contactShade, layShade, restingShade } from './contact-shadow'
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

test('the shade under a walker or animal lies along the slope it stands on', () => {
  const spot = { x: 14, y: 31, s: 220, yaw: 0.7, slopeX: 0.22, slopeS: -0.31 }
  const matrix = layShade(new Matrix4(), spot, 2.3, 4.3)
  const at = (across: number, along: number) => new Vector3(across, 0, along).applyMatrix4(matrix)
  let tallest = 0
  for (const [across, along] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const) {
    const corner = at(across, along)
    const ground = spot.y + spot.slopeX * (corner.x - spot.x) + spot.slopeS * (-corner.z - spot.s)
    expect(corner.y - ground).toBeCloseTo(restingShade.lift, 6)
    tallest = Math.max(tallest, Math.abs(corner.y - spot.y))
  }
  expect(tallest).toBeGreaterThan(0.3)
  expect(at(0.5, 0).distanceTo(at(-0.5, 0))).toBeCloseTo(2.3, 6)
  expect(at(0, 0.5).distanceTo(at(0, -0.5))).toBeCloseTo(4.3, 6)
  expect(
    at(0.5, 0)
      .sub(at(-0.5, 0))
      .dot(at(0, 0.5).sub(at(0, -0.5))),
  ).toBeCloseTo(0, 9)
})

test('on level ground the shade sits exactly where the flat one did', () => {
  const spot = { x: -6, y: 12, s: 90, yaw: -1.9, slopeX: 0, slopeS: 0 }
  const flat = new Object3D()
  flat.rotation.order = 'YXZ'
  flat.position.set(spot.x, spot.y + restingShade.lift, -spot.s)
  flat.rotation.set(0, spot.yaw, 0)
  flat.scale.set(1.4, 1, 2.7)
  flat.updateMatrix()
  const laid = layShade(new Matrix4(), spot, 1.4, 2.7)
  for (const [index, value] of flat.matrix.elements.entries())
    expect(laid.elements[index]).toBeCloseTo(value, 9)
})
