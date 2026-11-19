import { expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  archLift,
  createLoftBody,
  type LoftSpec,
  loftBands,
  loftSampler,
  loftSection,
  loftStops,
  projectOntoHull,
} from './loft-body'
import { type LoftVehicleId, loftVehicles } from './loft-vehicles'
import { tireDimensions } from './tire-dimensions'
import { vehicleMetrics } from './vehicles'

const ids = Object.keys(loftVehicles) as LoftVehicleId[]

const capsule: LoftSpec = {
  stations: [
    { z: -1, half: 0.5, floor: 0.3, belt: 0.6, edge: 0.4, top: 0.7 },
    { z: -0.9, half: 0.8, floor: 0.2, belt: 0.7, edge: 0.6, top: 0.9, crown: 0.02 },
    { z: 0.9, half: 0.8, floor: 0.2, belt: 0.7, edge: 0.6, top: 0.9, crown: 0.02 },
    { z: 1, half: 0.5, floor: 0.3, belt: 0.6, edge: 0.4, top: 0.7 },
  ],
  arches: [{ z: 0, height: 0.3, reach: 0.35, rise: 0.36, inset: 0.45 }],
  panels: [{ from: -0.5, to: 0.5, bands: ['upper'], material: 'glass' }],
  tuck: 0.03,
  radii: { sill: 0.04, belt: 0.03, rail: 0.05, gutter: 0.02 },
  spacing: 0.2,
}

function triangles(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const points = Array.from({ length: positions.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(positions, index),
  )
  return Array.from({ length: points.length / 3 }, (_, index) =>
    points.slice(index * 3, index * 3 + 3),
  ) as [THREE.Vector3, THREE.Vector3, THREE.Vector3][]
}

function volume(geometry: THREE.BufferGeometry) {
  return triangles(geometry).reduce(
    (sum, [a, b, c]) => sum + a.dot(new THREE.Vector3().crossVectors(b, c)) / 6,
    0,
  )
}

test('monotone station sampling passes through every station without overshoot', () => {
  const sample = loftSampler(capsule.stations)
  for (const station of capsule.stations) {
    const section = sample(station.z)
    expect(section.half).toBeCloseTo(station.half, 9)
    expect(section.top).toBeCloseTo(station.top, 9)
    expect(section.inner).toBeCloseTo(station.edge, 9)
    expect(section.deck).toBeCloseTo(station.top, 9)
  }
  for (let z = -1; z <= 1; z += 0.01) {
    const section = sample(z)
    expect(section.half).toBeGreaterThanOrEqual(0.5 - 1e-9)
    expect(section.half).toBeLessThanOrEqual(0.8 + 1e-9)
    expect(section.top).toBeLessThanOrEqual(0.9 + 1e-9)
  }
  expect(() => loftSampler([...capsule.stations].reverse())).toThrow()
})

test('station stops include every station, panel edge and arch edge within the spacing', () => {
  const stops = loftStops(capsule)
  for (const required of [-1, -0.9, -0.5, -0.35, 0, 0.35, 0.5, 0.9, 1])
    expect(stops.some((stop) => Math.abs(stop - required) < 1e-9)).toBe(true)
  for (let index = 1; index < stops.length; index++) {
    const gap = (stops[index] ?? 0) - (stops[index - 1] ?? 0)
    expect(gap).toBeGreaterThan(1e-3)
    expect(gap).toBeLessThanOrEqual(capsule.spacing + 1e-9)
  }
})

test('sections keep one point per band edge and collapse unused bands cleanly', () => {
  const sample = loftSampler(capsule.stations)
  for (const z of [-1, -0.3, 0, 0.6]) {
    const section = sample(z)
    const lift = archLift(capsule.arches, z, section.floor)
    const points = loftSection(section, lift, 0.45, capsule)
    expect(points.length).toBe(loftBands.length + 1)
    expect(points[0]?.[0]).toBe(0)
    expect(points.at(-1)?.[0]).toBeCloseTo(0, 9)
    for (const [x, y] of points) {
      expect(Number.isFinite(x + y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(-1e-9)
      expect(x).toBeLessThanOrEqual(section.half + 1e-9)
      expect(y).toBeGreaterThanOrEqual(section.floor - 1e-9)
      expect(y).toBeLessThanOrEqual(section.top + section.crown + 1e-9)
    }
    const lowestSide = Math.min(
      ...points.filter((_, index) => loftBands[index] === 'side').map(([, y]) => y),
    )
    expect(lowestSide).toBeGreaterThanOrEqual(lift - 1e-9)
  }
})

test.each([
  ['capsule', capsule],
  ...ids.map((id) => [id, loftVehicles[id].body] as [string, LoftSpec]),
])('%s loft is a closed outward shell with finite positions and unit normals', (_name, spec) => {
  const loft = createLoftBody(spec)
  const counts = loft.surfaces.map((surface) => surface.geometry.getAttribute('position').count)
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(
    loft.hull.getAttribute('position').count,
  )
  expect(loft.hull.getAttribute('position').count / 3).toBeLessThan(12000)
  expect(loft.surfaces.map((surface) => surface.material)).toContain('paint')
  expect(loft.surfaces.map((surface) => surface.material)).toContain('glass')
  expect(loft.surfaces.map((surface) => surface.material)).toContain('well')
  for (const geometry of [loft.hull, ...loft.surfaces.map((surface) => surface.geometry)]) {
    const positions = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal')
    expect(normals.count).toBe(positions.count)
    for (let index = 0; index < positions.count; index++) {
      expect(
        Number.isFinite(positions.getX(index) + positions.getY(index) + positions.getZ(index)),
      ).toBe(true)
      expect(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index))).toBeCloseTo(
        1,
        5,
      )
    }
  }
  const faces = triangles(loft.hull)
  const normals = loft.hull.getAttribute('normal')
  const face = new THREE.Vector3(),
    normal = new THREE.Vector3()
  const edges = new Map<string, number>()
  const key = (point: THREE.Vector3) =>
    `${Math.round(point.x * 1e4)},${Math.round(point.y * 1e4)},${Math.round(point.z * 1e4)}`
  for (const [index, [a, b, c]] of faces.entries()) {
    face.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
    for (let corner = 0; corner < 3; corner++)
      expect(face.dot(normal.fromBufferAttribute(normals, index * 3 + corner))).toBeGreaterThan(0.5)
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const forward = `${key(from)}>${key(to)}`,
        backward = `${key(to)}>${key(from)}`
      const open = edges.get(backward) ?? 0
      if (open > 0) edges.set(backward, open - 1)
      else edges.set(forward, (edges.get(forward) ?? 0) + 1)
    }
  }
  expect([...edges.values()].filter((count) => count !== 0).length).toBe(0)
  const bounds = new THREE.Box3().setFromBufferAttribute(
    loft.hull.getAttribute('position') as THREE.BufferAttribute,
  )
  const size = bounds.getSize(new THREE.Vector3())
  const filled = volume(loft.hull) / (size.x * size.y * size.z)
  expect(filled).toBeGreaterThan(0.35)
  expect(filled).toBeLessThan(0.95)
  expect(bounds.min.x).toBeCloseTo(-bounds.max.x, 6)
  expect(bounds.min.z).toBeCloseTo(spec.stations[0]?.z ?? 0, 6)
  expect(bounds.max.z).toBeCloseTo(spec.stations.at(-1)?.z ?? 0, 6)
  loft.hull.dispose()
  for (const surface of loft.surfaces) surface.geometry.dispose()
})

test('projected details follow the hull with outward faces and reject misses', () => {
  const loft = createLoftBody(capsule)
  const outline = [
    [-0.2, 0.4],
    [0.2, 0.4],
    [0.2, 0.6],
    [-0.2, 0.6],
  ] as const
  const flank = [
    [0.45, 0.4],
    [0.8, 0.4],
    [0.8, 0.6],
    [0.45, 0.6],
  ] as const
  for (const [axis, direction] of [
    ['z', -1],
    ['z', 1],
    ['x', 1],
    ['x', -1],
  ] as const) {
    const detail = projectOntoHull(
      loft.hull,
      axis === 'z' ? outline : flank,
      axis,
      direction,
      0.01,
      0.1,
    )
    const positions = detail.getAttribute('position'),
      normals = detail.getAttribute('normal')
    for (let index = 0; index < positions.count; index++) {
      const along = axis === 'z' ? positions.getZ(index) : positions.getX(index)
      const outward = axis === 'z' ? normals.getZ(index) : normals.getX(index)
      expect(along * direction).toBeGreaterThan(axis === 'z' ? 0.9 : 0.7)
      expect(along * direction).toBeLessThan(axis === 'z' ? 1.011 : 0.811)
      expect(outward * direction).toBeGreaterThan(0)
      expect(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index))).toBeCloseTo(
        1,
        5,
      )
    }
    const index = detail.index
    if (!index) throw new Error('Detail is not indexed')
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3()
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(positions, index.getX(i))
      b.fromBufferAttribute(positions, index.getX(i + 1))
      c.fromBufferAttribute(positions, index.getX(i + 2))
      const face = b.sub(a).cross(c.sub(a))
      expect((axis === 'z' ? face.z : face.x) * direction).toBeGreaterThan(0)
    }
    detail.dispose()
  }
  expect(() =>
    projectOntoHull(
      loft.hull,
      [
        [2, 2],
        [2.1, 2],
        [2.1, 2.1],
      ],
      'z',
      1,
      0.01,
    ),
  ).toThrow()
  loft.hull.dispose()
  for (const surface of loft.surfaces) surface.geometry.dispose()
})

test.each(ids)('%s body dimensions agree with its wheelbase, track and tires', (id) => {
  const spec = loftVehicles[id],
    metrics = vehicleMetrics[id],
    tire = tireDimensions[id]
  const sample = loftSampler(spec.body.stations)
  expect(spec.body.arches.map((arch) => arch.z).sort((a, b) => a - b)).toEqual([
    -metrics.wheelbase / 2,
    metrics.wheelbase / 2,
  ])
  const front = spec.body.stations[0]?.z ?? 0,
    rear = spec.body.stations.at(-1)?.z ?? 0
  for (const arch of spec.body.arches) {
    const section = sample(arch.z)
    const outerFace = metrics.trackWidth / 2 + tire.width / 2
    expect(section.half - outerFace).toBeGreaterThan(0.015)
    expect(section.half - outerFace).toBeLessThan(0.06)
    expect(arch.height).toBe(metrics.wheelRadius)
    expect(arch.reach).toBeGreaterThan(metrics.wheelRadius + 0.04)
    expect(arch.height + arch.rise).toBeGreaterThan(
      metrics.wheelRadius * 2 + metrics.suspensionTravel + 0.01,
    )
    expect(section.belt).toBeGreaterThan(arch.height + arch.rise + 0.02)
    expect(section.floor).toBeLessThan(metrics.wheelRadius)
    expect(section.floor).toBeGreaterThan(0.1)
    expect(arch.z - arch.reach).toBeGreaterThan(front + 0.2)
    expect(arch.z + arch.reach).toBeLessThan(rear - 0.2)
  }
  expect(spec.cowl).toBeGreaterThan(-metrics.wheelbase / 2)
  expect(spec.seat.z).toBeGreaterThan(spec.cowl + 0.4)
  const roof = sample(spec.seat.z)
  expect(spec.seat.y).toBeLessThan(roof.top + roof.crown)
  expect(spec.seat.y).toBeGreaterThan(roof.belt + 0.15)
  expect(Math.abs(spec.seat.x)).toBeLessThan(roof.edge)
  expect(spec.headlights[2]).toBeGreaterThan(front - 0.05)
  expect(spec.headlights[2]).toBeLessThan(-metrics.wheelbase / 2)
})

test.each(ids)('%s tires stay inside their arches through travel and steering lock', (id) => {
  const spec = loftVehicles[id],
    metrics = vehicleMetrics[id],
    tire = tireDimensions[id]
  const loft = createLoftBody(spec.body)
  const positions = loft.hull.getAttribute('position')
  const faces = triangles(loft.hull)
  const samples: THREE.Vector3[] = []
  for (const [a, b, c] of faces)
    for (const [u, v] of [
      [1, 0],
      [0, 1],
      [0, 0],
      [0.5, 0.5],
      [0.5, 0],
      [0, 0.5],
      [1 / 3, 1 / 3],
    ] as const)
      samples.push(
        a
          .clone()
          .multiplyScalar(1 - u - v)
          .addScaledVector(b, u)
          .addScaledVector(c, v),
      )
  expect(samples.length).toBe((positions.count / 3) * 7)
  for (const axle of [-1, 1])
    for (const side of [-1, 1])
      for (const offset of [-metrics.suspensionTravel, 0, metrics.suspensionTravel])
        for (const steering of axle < 0 ? [-metrics.maxSteering, 0, metrics.maxSteering] : [0]) {
          const centerX = (side * metrics.trackWidth) / 2,
            centerY = metrics.wheelRadius + offset,
            centerZ = (axle * metrics.wheelbase) / 2
          const sine = Math.sin(steering),
            cosine = Math.cos(steering)
          for (const point of samples) {
            const dx = point.x - centerX,
              dz = point.z - centerZ
            const lateral = dx * cosine - dz * sine,
              along = dx * sine + dz * cosine
            const inside =
              Math.abs(lateral) < tire.width / 2 &&
              Math.hypot(along, point.y - centerY) < metrics.wheelRadius
            expect(inside).toBe(false)
          }
        }
  loft.hull.dispose()
  for (const surface of loft.surfaces) surface.geometry.dispose()
})
