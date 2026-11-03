import * as THREE from 'three'
import { subdividePlanarSurface } from './surface-subdivide'

const frontHeights = [0.22, 0.44, 0.76, 0.88]
const rearHeights = [0.38, 0.5, 0.78, 0.88]
const frontProfile = new THREE.CubicInterpolant(
  new Float32Array(frontHeights),
  new Float32Array([-1.98, -2.1, -2.07, -1.91]),
  1,
)
const rearProfiles = new Map<number, THREE.CubicInterpolant>()

function rearProfile(wheelbase: number) {
  let profile = rearProfiles.get(wheelbase)
  if (!profile) {
    profile = new THREE.CubicInterpolant(
      new Float32Array(rearHeights),
      new Float32Array([wheelbase / 2 + 0.53, 1.92, 2, 1.86]),
      1,
    )
    rearProfiles.set(wheelbase, profile)
  }
  return profile
}

function blend(value: number, start: number, end: number) {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1)
  return { value: t * t * (3 - 2 * t), slope: (6 * t * (1 - t)) / (end - start) }
}

function section(y: number) {
  const sill = blend(y, 0.22, 0.5)
  const shoulder = blend(y, 0.74, 0.9)
  return {
    width: 0.8025 - 0.06 * (1 - sill.value) - 0.06 * shoulder.value,
    slopeY: 0.06 * (sill.slope - shoulder.slope),
  }
}

function halfWidth(y: number) {
  return section(y).width
}

function cornerRadius(y: number, direction: number) {
  return direction > 0
    ? 0.006 + blend(y, 0.43, 0.7).value * 0.14
    : 0.08 + blend(y, 0.22, 0.65).value * 0.07
}

function tailSweep(y: number) {
  return 0.07 * (1 - THREE.MathUtils.smoothstep(y, 0.6, 0.88))
}

function endDepth(y: number, fraction: number, wheelbase: number, direction: number) {
  const radius = cornerRadius(y, direction)
  const round = 1 - Math.sqrt(Math.max(0, 1 - fraction ** 8))
  if (direction < 0) return (frontProfile.evaluate(y)[0] ?? 0) + radius * round
  const x = fraction * halfWidth(y)
  return (
    (rearProfile(wheelbase).evaluate(y)[0] ?? 0) - tailSweep(y) * (x / 0.74) ** 2 - radius * round
  )
}

export function carRearDepth(y: number, x: number, wheelbase: number) {
  return endDepth(y, THREE.MathUtils.clamp(x / halfWidth(y), -1, 1), wheelbase, 1)
}

export function carFrontDepth(y: number, x: number) {
  return endDepth(y, THREE.MathUtils.clamp(x / halfWidth(y), -1, 1), 0, -1)
}

export function carEndNormal(
  y: number,
  x: number,
  wheelbase: number,
  direction: number,
  target: THREE.Vector3,
) {
  const { width, slopeY } = section(y)
  const fraction = THREE.MathUtils.clamp(x / width, -1, 1)
  const root = Math.sqrt(Math.max(0, 1 - fraction ** 8))
  const radius = cornerRadius(y, direction)
  const lower = Math.max(direction > 0 ? 0.38 : 0.22, y - 0.0001)
  const upper = Math.min(0.88, y + 0.0001)
  const slope =
    (endDepth(upper, fraction, wheelbase, direction) -
      endDepth(lower, fraction, wheelbase, direction)) /
    (upper - lower)
  const sweepSlope = direction > 0 ? (2 * tailSweep(y) * width ** 2 * fraction) / 0.74 ** 2 : 0
  const nx = 4 * radius * fraction ** 7 + direction * sweepSlope * root
  return target
    .set(nx, -nx * fraction * slopeY - direction * width * slope * root, direction * width * root)
    .normalize()
}

function profileRows(heights: number[]) {
  const rows = [heights[0] ?? 0]
  for (let index = 1; index < heights.length; index++) {
    const lower = heights[index - 1]
    const upper = heights[index]
    if (lower === undefined || upper === undefined)
      throw new Error('Body profile interval is missing')
    const steps = Math.ceil((upper - lower) / 0.025)
    for (let step = 1; step <= steps; step++)
      rows.push(THREE.MathUtils.lerp(lower, upper, step / steps))
  }
  return rows
}

export function carSurface(
  points: [number, number, number][],
  normal: [number, number, number],
  material: THREE.Material,
) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3))
  const first = points[0],
    second = points[1],
    third = points[2]
  if (!first || !second || !third) throw new Error('A surface needs at least three points')
  const a = new THREE.Vector3(...second).sub(new THREE.Vector3(...first)),
    b = new THREE.Vector3(...third).sub(new THREE.Vector3(...first))
  const outward = a.cross(b).dot(new THREE.Vector3(...normal)) > 0
  const indices: number[] = []
  for (let i = 1; i < points.length - 1; i++)
    indices.push(...(outward ? [0, i, i + 1] : [0, i + 1, i]))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

function wheelOpening(axle: number, radius: number, opening: number) {
  const points: [number, number][] = axle < 0 ? [[axle + opening, 0.22]] : []
  for (let sample = 0; sample <= 24; sample++) {
    const angle = (sample * Math.PI) / 24
    points.push([axle + Math.cos(angle) * opening, radius + Math.sin(angle) * opening])
  }
  points.push([axle - opening, 0.22])
  const refined: [number, number][] = []
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const end = points[index]
    if (!start || !end) throw new Error('Wheel opening segment is missing')
    if (index === 1) refined.push(start)
    const steps = Math.ceil(Math.hypot(end[0] - start[0], (end[1] - start[1]) * 4) / 0.16)
    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      refined.push([
        THREE.MathUtils.lerp(start[0], end[0], t),
        THREE.MathUtils.lerp(start[1], end[1], t),
      ])
    }
  }
  return refined
}

export function createCarBody(
  wheelbase: number,
  wheelRadius: number,
  paint: THREE.Material,
  interior: THREE.Material,
  wheelWell: THREE.Material,
) {
  const group = new THREE.Group()
  group.name = 'coachwork'
  const frontRows = profileRows(frontHeights)
  const rearRows = profileRows(rearHeights)
  const front = frontRows.map((y) => [y, carFrontDepth(y, halfWidth(y))] as const)
  const rear = rearRows.map((y) => [y, carRearDepth(y, halfWidth(y), wheelbase)] as const)
  const opening = 0.44
  const shape = new THREE.Shape()
  const first = front[0]
  if (!first) throw new Error('Body front profile is unavailable')
  shape.moveTo(first[1], first[0])
  for (const [y, z] of front.slice(1)) shape.lineTo(z, y)
  for (const [y, z] of [...rear].reverse()) shape.lineTo(z, y)
  const openings = [wheelbase / 2, -wheelbase / 2].map((axle) =>
    wheelOpening(axle, wheelRadius, opening),
  )
  for (const points of openings) for (const [z, y] of points) shape.lineTo(z, y)
  shape.closePath()
  for (const side of [-1, 1]) {
    const planar = new THREE.ShapeGeometry(shape, 12)
    planar.scale(1, 4, 1)
    const geometry = subdividePlanarSurface(planar, 0.18)
    planar.dispose()
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    const normal = new THREE.Vector3()
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const z = positions.getX(vertex)
      const y = positions.getY(vertex) / 4
      const contour = section(y)
      positions.setXYZ(vertex, side * contour.width, y, z)
      normal.set(side, -contour.slopeY, 0).normalize()
      normals.setXYZ(vertex, normal.x, normal.y, normal.z)
    }
    const indices = geometry.index
    if (!indices) throw new Error('Coachwork topology is unavailable')
    if (side > 0)
      for (let triangle = 0; triangle < indices.count; triangle += 3) {
        const second = indices.getX(triangle + 1)
        indices.setX(triangle + 1, indices.getX(triangle + 2))
        indices.setX(triangle + 2, second)
      }
    const skin = new THREE.Mesh(geometry, paint)
    skin.name = 'side-skin'
    group.add(skin)
    for (const lip of openings) {
      for (let segment = 1; segment < lip.length; segment++) {
        const start = lip[segment - 1]
        const end = lip[segment]
        if (!start || !end) continue
        const point = ([z, y]: [number, number], inset: number): [number, number, number] => [
          side * (halfWidth(y) - inset),
          y,
          z,
        ]
        group.add(
          carSurface(
            [point(start, 0), point(end, 0), point(end, 0.075), point(start, 0.075)],
            [0, end[0] - start[0], start[1] - end[1]],
            paint,
          ),
        )
      }
    }
    for (const axle of [-wheelbase / 2, wheelbase / 2]) {
      const radius = opening - 0.012
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.44, 24, 1, true, 0, Math.PI),
        wheelWell,
      )
      liner.rotation.z = Math.PI / 2
      liner.position.set(side * 0.54, wheelRadius, axle)
      group.add(liner)
      const backing = new THREE.Shape()
      backing.moveTo(-radius, wheelRadius)
      backing.absarc(0, wheelRadius, radius, Math.PI, 0, true)
      backing.closePath()
      const wall = new THREE.Mesh(new THREE.ShapeGeometry(backing, 24), wheelWell)
      wall.rotation.y = (side * Math.PI) / 2
      wall.position.set(side * 0.32, 0, axle)
      group.add(wall)
    }
  }
  const frontBulkhead = -wheelbase / 2 + opening + 0.035
  const rearBulkhead = wheelbase / 2 - opening - 0.035
  for (const direction of [-1, 1]) {
    const rows = direction < 0 ? frontRows : rearRows
    const positions: number[] = []
    const normals: number[] = []
    const indices: number[] = []
    const normal = new THREE.Vector3()
    const columns = 32
    for (const y of rows)
      for (let column = 0; column <= columns; column++) {
        const fraction = Math.sin((column / columns - 0.5) * Math.PI)
        const x = halfWidth(y) * fraction
        positions.push(x, y, endDepth(y, fraction, wheelbase, direction))
        carEndNormal(y, x, wheelbase, direction, normal)
        normals.push(normal.x, normal.y, normal.z)
      }
    for (let row = 1; row < rows.length; row++)
      for (let column = 0; column < columns; column++) {
        const a = (row - 1) * (columns + 1) + column
        const b = a + 1
        const c = a + columns + 1
        const d = c + 1
        indices.push(...(direction > 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d]))
      }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setIndex(indices)
    const panel = new THREE.Mesh(geometry, paint)
    panel.name = direction < 0 ? 'front-panel' : 'rear-panel'
    group.add(panel)

    const bulkhead = direction < 0 ? frontBulkhead : rearBulkhead
    const deckPositions: number[] = []
    const deckIndices: number[] = []
    const length = 12
    for (let row = 0; row <= length; row++)
      for (let column = 0; column <= columns; column++) {
        const fraction = Math.sin((column / columns - 0.5) * Math.PI)
        const t = row / length
        const x = halfWidth(0.88) * fraction
        deckPositions.push(
          x,
          0.88 + 0.014 * Math.sin(t * Math.PI) * (1 - fraction ** 2),
          THREE.MathUtils.lerp(bulkhead, endDepth(0.88, fraction, wheelbase, direction), t),
        )
      }
    for (let row = 1; row <= length; row++)
      for (let column = 0; column < columns; column++) {
        const a = (row - 1) * (columns + 1) + column
        const b = a + 1
        const c = a + columns + 1
        const d = c + 1
        deckIndices.push(...(direction > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c]))
      }
    const deckGeometry = new THREE.BufferGeometry()
    deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(deckPositions, 3))
    deckGeometry.setIndex(deckIndices)
    deckGeometry.computeVertexNormals()
    group.add(new THREE.Mesh(deckGeometry, paint))
  }
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(1.38, 0.06, rearBulkhead - frontBulkhead),
    interior,
  )
  floor.name = 'cockpit-floor'
  floor.position.set(0, 0.3, (rearBulkhead + frontBulkhead) / 2)
  group.add(floor)
  for (const side of [-1, 1]) {
    group.add(
      carSurface(
        [
          [side * 0.69, 0.31, frontBulkhead],
          [side * 0.69, 0.31, rearBulkhead],
          [side * 0.705, 0.88, rearBulkhead],
          [side * 0.705, 0.88, frontBulkhead],
        ],
        [-side, 0, 0],
        interior,
      ),
    )
    group.add(
      carSurface(
        [
          [side * 0.705, 0.88, frontBulkhead],
          [side * halfWidth(0.88), 0.88, frontBulkhead],
          [side * halfWidth(0.88), 0.88, rearBulkhead],
          [side * 0.705, 0.88, rearBulkhead],
        ],
        [0, 1, 0],
        paint,
      ),
    )
  }
  for (const z of [frontBulkhead, rearBulkhead])
    group.add(
      carSurface(
        [
          [-0.705, 0.31, z],
          [0.705, 0.31, z],
          [0.705, 0.88, z],
          [-0.705, 0.88, z],
        ],
        [0, 0, z < 0 ? 1 : -1],
        interior,
      ),
    )
  for (const [start, end] of [
    [-1.98, frontBulkhead],
    [rearBulkhead, carRearDepth(0.38, 0.29, wheelbase)],
  ]) {
    if (start === undefined || end === undefined) continue
    const undertray = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, end - start), interior)
    undertray.position.set(0, 0.425, (start + end) / 2)
    group.add(undertray)
  }
  for (const [start, end] of [
    [-1.98, -wheelbase / 2 - opening],
    [wheelbase / 2 + opening, carRearDepth(0.38, 0.68, wheelbase)],
  ]) {
    if (start === undefined || end === undefined) continue
    const undertray = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.05, end - start), interior)
    undertray.position.set(0, 0.425, (start + end) / 2)
    group.add(undertray)
  }
  return group
}
