import * as THREE from 'three'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'

function rearProfile(wheelbase: number) {
  return [
    [0.38, wheelbase / 2 + 0.46],
    [0.5, 1.92],
    [0.78, 2],
    [0.88, 1.86],
  ] as const
}
const frontProfile = [
  [0.22, -1.98],
  [0.44, -2.1],
  [0.76, -2.07],
  [0.88, -1.91],
] as const

function profileDepth(profile: readonly (readonly [number, number])[], y: number) {
  for (let i = 1; i < profile.length; i++) {
    const lower = profile[i - 1],
      upper = profile[i]
    if (lower && upper && y <= upper[0])
      return THREE.MathUtils.lerp(
        lower[1],
        upper[1],
        THREE.MathUtils.clamp((y - lower[0]) / (upper[0] - lower[0]), 0, 1),
      )
  }
  return profile.at(-1)?.[1] ?? 0
}

export function carRearDepth(y: number, wheelbase: number) {
  return profileDepth(rearProfile(wheelbase), y)
}

export function carFrontDepth(y: number) {
  return profileDepth(frontProfile, y)
}

function blend(value: number, start: number, end: number) {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1)
  return { value: t * t * (3 - 2 * t), slope: (6 * t * (1 - t)) / (end - start) }
}

function section(y: number, z: number) {
  const sill = blend(y, 0.22, 0.5),
    shoulder = blend(y, 0.74, 0.9),
    end = blend(Math.abs(z), 1.82, 2.14)
  return {
    width: 0.8025 - 0.06 * (1 - sill.value) - 0.06 * shoulder.value - 0.04 * end.value,
    slopeY: 0.06 * (sill.slope - shoulder.slope),
    slopeZ: -0.04 * end.slope * Math.sign(z),
  }
}

function halfWidth(y: number, z: number) {
  return section(y, z).width
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

export function createCarBody(
  wheelbase: number,
  wheelRadius: number,
  paint: THREE.Material,
  interior: THREE.Material,
  wheelWell: THREE.Material,
) {
  const group = new THREE.Group()
  group.name = 'coachwork'
  const rear = rearProfile(wheelbase)
  const opening = 0.44
  const shape = new THREE.Shape()
  shape.moveTo(-1.98, 0.22)
  for (const [y, z] of frontProfile.slice(1)) shape.lineTo(z, y)
  for (const [y, z] of [...rear].reverse()) shape.lineTo(z, y)
  for (const axle of [wheelbase / 2, -wheelbase / 2]) {
    if (axle < 0) shape.lineTo(axle + opening, 0.22)
    shape.lineTo(axle + opening, wheelRadius)
    shape.absarc(axle, wheelRadius, opening, 0, Math.PI, false)
    shape.lineTo(axle - opening, 0.22)
  }
  shape.closePath()
  for (const side of [-1, 1]) {
    const extrusion = new THREE.ExtrudeGeometry(shape, {
      depth: 0.075,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.014,
      bevelThickness: 0.014,
      bevelSegments: 2,
      curveSegments: 12,
    })
    const geometry = new TessellateModifier(0.22, 8).modify(extrusion)
    extrusion.dispose()
    geometry.translate(0, 0, -0.0375)
    geometry.rotateY(-Math.PI / 2)
    const positions = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal')
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i),
        z = positions.getZ(i),
        contour = section(y, z)
      const normal = new THREE.Vector3(
        normals.getX(i),
        normals.getY(i) - normals.getX(i) * side * contour.slopeY,
        normals.getZ(i) - normals.getX(i) * side * contour.slopeZ,
      ).normalize()
      positions.setX(i, positions.getX(i) + side * (contour.width - 0.0375))
      normals.setXYZ(i, normal.x, normal.y, normal.z)
    }
    group.add(new THREE.Mesh(geometry, paint))
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
  const deck = (from: number, to: number) => {
    const sections = [from, from + (to - from) * 0.25, to]
    for (let i = 1; i < sections.length; i++) {
      const start = sections[i - 1],
        end = sections[i]
      if (start === undefined || end === undefined) continue
      const fractions = [-1, -0.7, 0, 0.7, 1]
      for (let j = 1; j < fractions.length; j++) {
        const left = fractions[j - 1],
          right = fractions[j]
        if (left === undefined || right === undefined) continue
        const point = (z: number, fraction: number): [number, number, number] => [
          fraction * halfWidth(0.88, z),
          0.88 + 0.022 * Math.sin(((z - from) / (to - from)) * Math.PI) * (1 - fraction ** 2),
          z,
        ]
        group.add(
          carSurface(
            [point(start, left), point(start, right), point(end, right), point(end, left)],
            [0, 1, 0],
            paint,
          ),
        )
      }
    }
  }
  const frontBulkhead = -wheelbase / 2 + opening + 0.035,
    rearBulkhead = wheelbase / 2 - opening - 0.035
  deck(-1.91, frontBulkhead)
  deck(rearBulkhead, 1.86)
  for (const [profile, normal] of [
    [rear, 1],
    [frontProfile, -1],
  ] as const) {
    for (let i = 1; i < profile.length; i++) {
      const lower = profile[i - 1],
        upper = profile[i]
      if (!lower || !upper) continue
      group.add(
        carSurface(
          [
            [-halfWidth(lower[0], lower[1]), lower[0], lower[1]],
            [halfWidth(lower[0], lower[1]), lower[0], lower[1]],
            [halfWidth(upper[0], upper[1]), upper[0], upper[1]],
            [-halfWidth(upper[0], upper[1]), upper[0], upper[1]],
          ],
          [0, 0, normal],
          paint,
        ),
      )
    }
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
          [side * halfWidth(0.88, frontBulkhead), 0.88, frontBulkhead],
          [side * halfWidth(0.88, rearBulkhead), 0.88, rearBulkhead],
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
    [rearBulkhead, rear[0][1]],
  ]) {
    if (start === undefined || end === undefined) continue
    const undertray = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, end - start), interior)
    undertray.position.set(0, 0.425, (start + end) / 2)
    group.add(undertray)
  }
  for (const [start, end] of [
    [-1.98, -wheelbase / 2 - opening],
    [wheelbase / 2 + opening, rear[0][1]],
  ]) {
    if (start === undefined || end === undefined) continue
    const undertray = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.05, end - start), interior)
    undertray.position.set(0, 0.425, (start + end) / 2)
    group.add(undertray)
  }
  return group
}
