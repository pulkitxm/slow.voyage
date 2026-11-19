import * as THREE from 'three'
import { subdividePlanarSurface } from './surface-subdivide'

export type LoftMaterial = 'paint' | 'glass' | 'trim' | 'well'
export type LoftBand =
  | 'floor'
  | 'wall'
  | 'arch'
  | 'sill'
  | 'side'
  | 'belt'
  | 'upper'
  | 'rail'
  | 'drop'
  | 'gutter'
  | 'top'

export interface LoftStation {
  z: number
  half: number
  floor: number
  belt: number
  edge: number
  top: number
  crown?: number
  inner?: number
  deck?: number
  bow?: number
}

export interface LoftArch {
  z: number
  height: number
  reach: number
  rise: number
  inset: number
}

export interface LoftPanel {
  from: number
  to: number
  bands: readonly LoftBand[]
  material: LoftMaterial
}

export interface LoftSpec {
  stations: readonly LoftStation[]
  arches: readonly LoftArch[]
  panels: readonly LoftPanel[]
  tuck: number
  radii: { sill: number; belt: number; rail: number; gutter: number }
  spacing: number
}

type Section = Required<LoftStation>
type Point = [number, number]

const segments: readonly { band: LoftBand; count: number }[] = [
  { band: 'floor', count: 2 },
  { band: 'wall', count: 1 },
  { band: 'arch', count: 2 },
  { band: 'side', count: 4 },
  { band: 'upper', count: 4 },
  { band: 'drop', count: 2 },
  { band: 'top', count: 1 },
  { band: 'top', count: 1 },
  { band: 'top', count: 6 },
]
const corners: readonly { band: LoftBand; count: number }[] = [
  { band: 'wall', count: 0 },
  { band: 'arch', count: 0 },
  { band: 'sill', count: 3 },
  { band: 'belt', count: 2 },
  { band: 'rail', count: 3 },
  { band: 'gutter', count: 2 },
  { band: 'top', count: 0 },
  { band: 'top', count: 0 },
]
export const loftBands: readonly LoftBand[] = segments.flatMap((segment, index) => {
  const corner = corners[index]
  return [
    ...Array<LoftBand>(segment.count).fill(segment.band),
    ...(corner ? Array<LoftBand>(corner.count).fill(corner.band) : []),
  ]
})
const capScales = [0, 0.3, 0.55, 0.8]
const archSamples = 14
const creaseCosine = Math.cos(THREE.MathUtils.degToRad(48))
const fields = ['half', 'floor', 'belt', 'edge', 'top', 'crown', 'inner', 'deck', 'bow'] as const

function complete(station: LoftStation): Section {
  return {
    ...station,
    crown: station.crown ?? 0,
    inner: station.inner ?? station.edge,
    deck: station.deck ?? station.top,
    bow: station.bow ?? 0,
  }
}

function monotoneSlopes(xs: readonly number[], ys: readonly number[]) {
  const count = xs.length
  const secants: number[] = []
  for (let i = 0; i < count - 1; i++)
    secants.push(((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / ((xs[i + 1] ?? 0) - (xs[i] ?? 0)))
  const slopes: number[] = []
  for (let i = 0; i < count; i++) {
    const before = secants[i - 1],
      after = secants[i]
    if (before === undefined || after === undefined) slopes.push(before ?? after ?? 0)
    else if (before * after <= 0) slopes.push(0)
    else {
      const left = (xs[i] ?? 0) - (xs[i - 1] ?? 0),
        right = (xs[i + 1] ?? 0) - (xs[i] ?? 0)
      const first = 2 * right + left,
        second = right + 2 * left
      slopes.push((first + second) / (first / before + second / after))
    }
  }
  return slopes
}

export function loftSampler(stations: readonly LoftStation[]) {
  const sections = stations.map(complete)
  const xs = sections.map((section) => section.z)
  for (let i = 1; i < xs.length; i++)
    if ((xs[i] ?? 0) <= (xs[i - 1] ?? 0)) throw new Error('Loft stations must advance along z')
  const slopes = Object.fromEntries(
    fields.map((field) => [
      field,
      monotoneSlopes(
        xs,
        sections.map((section) => section[field]),
      ),
    ]),
  ) as Record<(typeof fields)[number], number[]>
  return (z: number): Section => {
    const first = sections[0],
      last = sections.at(-1)
    if (!first || !last) throw new Error('Loft needs stations')
    if (z <= first.z) return { ...first, z }
    if (z >= last.z) return { ...last, z }
    let index = 0
    while ((xs[index + 1] ?? Infinity) < z) index++
    const a = sections[index],
      b = sections[index + 1]
    if (!a || !b) throw new Error('Loft station is missing')
    const span = b.z - a.z
    const t = (z - a.z) / span
    const h00 = (1 + 2 * t) * (1 - t) ** 2,
      h10 = t * (1 - t) ** 2,
      h01 = t * t * (3 - 2 * t),
      h11 = t * t * (t - 1)
    const section = { z } as Section
    for (const field of fields)
      section[field] =
        h00 * a[field] +
        h10 * span * (slopes[field][index] ?? 0) +
        h01 * b[field] +
        h11 * span * (slopes[field][index + 1] ?? 0)
    return section
  }
}

export function archLift(arches: readonly LoftArch[], z: number, floor: number) {
  let lift = floor
  for (const arch of arches) {
    const offset = Math.abs(z - arch.z) / arch.reach
    if (offset < 1 - 1e-9)
      lift = Math.max(lift, arch.height + arch.rise * Math.sqrt(1 - offset * offset))
  }
  return lift
}

export function loftStops(spec: LoftSpec) {
  const required: number[] = spec.stations.map((station) => station.z)
  const front = required[0] ?? 0,
    rear = required.at(-1) ?? 0
  for (const arch of spec.arches)
    for (let i = 0; i <= archSamples; i++)
      required.push(arch.z + arch.reach * Math.cos((i / archSamples) * Math.PI))
  for (const panel of spec.panels) required.push(panel.from, panel.to)
  const sorted = required.filter((z) => z >= front && z <= rear).sort((a, b) => a - b)
  const stops: number[] = []
  for (const z of sorted) {
    const previous = stops.at(-1)
    if (previous === undefined) stops.push(z)
    else if (z - previous > 1e-3) {
      const steps = Math.ceil((z - previous) / spec.spacing)
      for (let i = 1; i <= steps; i++) stops.push(previous + ((z - previous) * i) / steps)
    }
  }
  return stops
}

export function loftSection(section: Section, lift: number, inset: number, spec: LoftSpec) {
  const { half, floor, belt, edge, top, inner, deck, crown } = section
  const wall = Math.min(inset, half - 0.1)
  const tub = lift > floor && lift + 0.04 > deck ? lift + 0.04 : deck
  const vertices: Point[] = [
    [0, floor],
    [wall, floor],
    [wall, lift],
    [half, lift],
    [half, belt],
    [edge, top],
    [inner, tub],
    [Math.min(inner, wall - 0.04), tub],
    [Math.min(inner, wall - 0.04), deck],
    [0, deck],
  ]
  const radii = [0, 0, spec.radii.sill, spec.radii.belt, spec.radii.rail, spec.radii.gutter, 0, 0]
  const lengths: number[] = [],
    directions: Point[] = []
  for (let i = 0; i < segments.length; i++) {
    const a = vertices[i] ?? [0, 0],
      b = vertices[i + 1] ?? [0, 0]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    lengths.push(length)
    directions.push(length > 1e-6 ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : [0, 0])
  }
  const following = (index: number) => {
    for (let i = index; i < lengths.length; i++) if ((lengths[i] ?? 0) > 1e-6) return i
    return -1
  }
  const trims: number[] = [0]
  for (let i = 1; i < segments.length; i++) {
    const before = lengths[i - 1] ?? 0
    const next = following(i)
    if (before <= 1e-6) trims.push(trims[i - 1] ?? 0)
    else
      trims.push(
        next < 0 ? 0 : Math.min(radii[i - 1] ?? 0, before * 0.45, (lengths[next] ?? 0) * 0.45),
      )
  }
  trims.push(0)
  const points: Point[] = [[0, floor]]
  let pen: Point = [0, floor]
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i],
      a = vertices[i],
      b = vertices[i + 1],
      direction = directions[i]
    if (!segment || !a || !b || !direction) throw new Error('Loft section is incomplete')
    const solid = (lengths[i] ?? 0) > 1e-6
    const start: Point = solid
      ? [a[0] + direction[0] * (trims[i] ?? 0), a[1] + direction[1] * (trims[i] ?? 0)]
      : pen
    const end: Point = solid
      ? [b[0] - direction[0] * (trims[i + 1] ?? 0), b[1] - direction[1] * (trims[i + 1] ?? 0)]
      : pen
    for (let step = 1; step <= segment.count; step++) {
      const t = step / segment.count
      points.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t])
    }
    pen = end
    const corner = corners[i]
    if (!corner) continue
    const next = following(i + 1)
    const out = directions[next]
    const trim = trims[i + 1] ?? 0
    const exit: Point =
      solid && out && trim > 0 ? [b[0] + out[0] * trim, b[1] + out[1] * trim] : solid ? b : pen
    for (let step = 1; step <= corner.count; step++) {
      const t = step / corner.count
      const u = 1 - t
      points.push(
        solid
          ? [
              u * u * end[0] + 2 * u * t * b[0] + t * t * exit[0],
              u * u * end[1] + 2 * u * t * b[1] + t * t * exit[1],
            ]
          : pen,
      )
    }
    pen = exit
  }
  const height = belt - floor
  return points.map(([x, y], index): Point => {
    const band = loftBands[Math.min(index, loftBands.length - 1)]
    const raised =
      crown && inner > 1e-6 && (band === 'top' || band === 'gutter') && x < inner
        ? y + crown * (1 - (x / inner) ** 2)
        : y
    const depth = THREE.MathUtils.clamp((belt - y) / height, 0, 1)
    return [x * (1 - (spec.tuck / half) * depth * depth), raised]
  })
}

interface Triangle {
  positions: number[]
  normals: number[]
  normal: THREE.Vector3
  unit: THREE.Vector3
  material: LoftMaterial
}

function creaseNormals(triangles: Triangle[]) {
  const key = (x: number, y: number, z: number) =>
    (Math.round(x * 1e4) + 50000) * 1e10 +
    (Math.round(y * 1e4) + 50000) * 1e5 +
    (Math.round(z * 1e4) + 50000)
  const corner = (triangle: Triangle, index: number) =>
    key(
      triangle.positions[index * 3] ?? 0,
      triangle.positions[index * 3 + 1] ?? 0,
      triangle.positions[index * 3 + 2] ?? 0,
    )
  const shared = new Map<number, Triangle[]>()
  for (const triangle of triangles)
    for (let index = 0; index < 3; index++) {
      const id = corner(triangle, index)
      const list = shared.get(id)
      if (list) list.push(triangle)
      else shared.set(id, [triangle])
    }
  const sum = new THREE.Vector3()
  for (const triangle of triangles)
    for (let index = 0; index < 3; index++) {
      sum.set(0, 0, 0)
      for (const other of shared.get(corner(triangle, index)) ?? [])
        if (other.unit.dot(triangle.unit) >= creaseCosine) sum.add(other.normal)
      sum.normalize()
      triangle.normals.push(sum.x, sum.y, sum.z)
    }
}

function triangleGeometry(triangles: Triangle[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      triangles.flatMap((triangle) => triangle.positions),
      3,
    ),
  )
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      triangles.flatMap((triangle) => triangle.normals),
      3,
    ),
  )
  return geometry
}

export function createLoftBody(spec: LoftSpec) {
  const sample = loftSampler(spec.stations)
  const stops = loftStops(spec)
  const columns = loftBands.length
  const rows: { z: number; cap: boolean; arched: boolean; points: THREE.Vector3[] }[] = []
  const row = (z: number, scale: number) => {
    const section = sample(z)
    const lift = archLift(spec.arches, z, section.floor)
    const arched = lift > section.floor
    const clear = Math.min(
      ...spec.arches.map((candidate) => Math.abs(z - candidate.z) - candidate.reach),
    )
    const bow = section.bow * THREE.MathUtils.smoothstep(clear, 0, 0.15)
    if (section.top <= section.belt || section.belt <= lift)
      throw new Error(`Loft section at ${z.toFixed(3)} has no side height`)
    const arch = spec.arches.find((candidate) => Math.abs(z - candidate.z) < candidate.reach)
    const profile = loftSection(section, lift, arch?.inset ?? section.half * 0.6, spec)
    const middle = (section.floor + section.top) / 2
    const points: THREE.Vector3[] = []
    for (let column = 0; column < columns * 2; column++) {
      const mirrored = column > columns
      const point = profile[mirrored ? columns * 2 - column : column]
      if (!point) throw new Error('Loft profile is incomplete')
      const x = point[0] * scale * (mirrored ? -1 : 1)
      points.push(
        new THREE.Vector3(
          x,
          middle + (point[1] - middle) * scale,
          z + bow * (x / section.half) ** 2,
        ),
      )
    }
    rows.push({ z, cap: scale < 1, arched, points })
  }
  const front = stops[0],
    rear = stops.at(-1)
  if (front === undefined || rear === undefined) throw new Error('Loft needs stations')
  for (const scale of capScales) row(front, scale)
  for (const z of stops) row(z, 1)
  for (const scale of [...capScales].reverse()) row(rear, scale)
  const triangles: Triangle[] = []
  const edgeA = new THREE.Vector3(),
    edgeB = new THREE.Vector3()
  const add = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, material: LoftMaterial) => {
    const normal = new THREE.Vector3().crossVectors(edgeA.subVectors(b, a), edgeB.subVectors(c, a))
    if (normal.length() < 1e-9) return
    triangles.push({
      positions: [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z],
      normals: [],
      normal,
      unit: normal.clone().normalize(),
      material,
    })
  }
  for (let index = 0; index < rows.length - 1; index++) {
    const near = rows[index],
      far = rows[index + 1]
    if (!near || !far) continue
    const cap = near.cap || far.cap
    const middle = (near.z + far.z) / 2
    for (let column = 0; column < columns * 2; column++) {
      const band = loftBands[column < columns ? column : columns * 2 - 1 - column]
      if (!band) continue
      let material: LoftMaterial = 'paint'
      if (!cap) {
        if (band === 'floor') material = 'trim'
        else if (band === 'wall' || band === 'arch')
          material = near.arched || far.arched ? 'well' : 'trim'
        for (const panel of spec.panels)
          if (middle >= panel.from && middle <= panel.to && panel.bands.includes(band))
            material = panel.material
      }
      const next = (column + 1) % (columns * 2)
      const a = near.points[column],
        b = near.points[next],
        c = far.points[next],
        d = far.points[column]
      if (!a || !b || !c || !d) continue
      add(a, b, c, material)
      add(a, c, d, material)
    }
  }
  creaseNormals(triangles)
  const materials: LoftMaterial[] = ['paint', 'glass', 'trim', 'well']
  return {
    hull: triangleGeometry(triangles),
    surfaces: materials.flatMap((material) => {
      const selected = triangles.filter((triangle) => triangle.material === material)
      return selected.length ? [{ material, geometry: triangleGeometry(selected) }] : []
    }),
  }
}

export function projectOntoHull(
  hull: THREE.BufferGeometry,
  outline: readonly (readonly [number, number])[],
  axis: 'x' | 'z',
  direction: number,
  lift: number,
  edge = 0.07,
) {
  const flat = new THREE.ShapeGeometry(
    new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v))),
  )
  const geometry = subdividePlanarSurface(flat, edge)
  flat.dispose()
  const source = hull.getAttribute('position'),
    sourceNormals = hull.getAttribute('normal')
  const depth = (index: number) => (axis === 'z' ? source.getZ(index) : source.getX(index))
  const across = (index: number) => (axis === 'z' ? source.getX(index) : source.getZ(index))
  const facing: number[] = []
  for (let i = 0; i < source.count; i += 3) {
    const ux = across(i + 1) - across(i),
      uy = source.getY(i + 1) - source.getY(i),
      vx = across(i + 2) - across(i),
      vy = source.getY(i + 2) - source.getY(i)
    const area = ux * vy - uy * vx
    const outward =
      (axis === 'z' ? sourceNormals.getZ(i) : sourceNormals.getX(i)) * direction > 0.02
    if (outward && Math.abs(area) > 1e-10) facing.push(i)
  }
  const positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal')
  const normal = new THREE.Vector3()
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const u = positions.getX(vertex),
      v = positions.getY(vertex)
    let best = -Infinity
    for (const i of facing) {
      const ax = across(i),
        ay = source.getY(i),
        bx = across(i + 1),
        by = source.getY(i + 1),
        cx = across(i + 2),
        cy = source.getY(i + 2)
      if (
        u < Math.min(ax, bx, cx) - 1e-6 ||
        u > Math.max(ax, bx, cx) + 1e-6 ||
        v < Math.min(ay, by, cy) - 1e-6 ||
        v > Math.max(ay, by, cy) + 1e-6
      )
        continue
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      const second = ((u - ax) * (cy - ay) - (v - ay) * (cx - ax)) / area
      const third = ((bx - ax) * (v - ay) - (by - ay) * (u - ax)) / area
      const first = 1 - second - third
      if (first < -1e-6 || second < -1e-6 || third < -1e-6) continue
      const reach = (first * depth(i) + second * depth(i + 1) + third * depth(i + 2)) * direction
      if (reach <= best) continue
      best = reach
      normal
        .set(
          first * sourceNormals.getX(i) +
            second * sourceNormals.getX(i + 1) +
            third * sourceNormals.getX(i + 2),
          first * sourceNormals.getY(i) +
            second * sourceNormals.getY(i + 1) +
            third * sourceNormals.getY(i + 2),
          first * sourceNormals.getZ(i) +
            second * sourceNormals.getZ(i + 1) +
            third * sourceNormals.getZ(i + 2),
        )
        .normalize()
    }
    if (best === -Infinity) throw new Error(`Loft detail misses the body at ${u}, ${v}`)
    const surface = best * direction + direction * lift
    if (axis === 'z') positions.setXYZ(vertex, u, v, surface)
    else positions.setXYZ(vertex, surface, v, u)
    normals.setXYZ(vertex, normal.x, normal.y, normal.z)
  }
  const index = geometry.index
  if (!index) throw new Error('Loft detail has no triangles')
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    face = new THREE.Vector3()
  for (let i = 0; i < index.count; i += 3) {
    const first = index.getX(i),
      second = index.getX(i + 1),
      third = index.getX(i + 2)
    a.fromBufferAttribute(positions, first)
    b.fromBufferAttribute(positions, second)
    c.fromBufferAttribute(positions, third)
    face.crossVectors(b.sub(a), c.sub(a))
    normal.fromBufferAttribute(normals, first)
    if (face.dot(normal) < 0) {
      index.setX(i + 1, third)
      index.setX(i + 2, second)
    }
  }
  return geometry
}
