import * as THREE from 'three'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'

const rearProfile = [
  [0.22, 1.91],
  [0.44, 2.02],
  [0.78, 2],
  [0.88, 1.86],
] as const

export function carRearDepth(y: number) {
  for (let i = 1; i < rearProfile.length; i++) {
    const lower = rearProfile[i - 1],
      upper = rearProfile[i]
    if (lower && upper && y <= upper[0])
      return THREE.MathUtils.lerp(
        lower[1],
        upper[1],
        THREE.MathUtils.clamp((y - lower[0]) / (upper[0] - lower[0]), 0, 1),
      )
  }
  return 1.86
}

function halfWidth(y: number, z: number) {
  return (
    0.8025 -
    Math.max(0, y - 0.77) * 0.55 -
    Math.max(0, 0.46 - y) * 0.25 -
    Math.max(0, Math.abs(z) - 1.85) * 0.3
  )
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
  const opening = 0.44
  const shape = new THREE.Shape()
  shape.moveTo(-1.98, 0.22)
  shape.lineTo(-2.1, 0.44)
  shape.lineTo(-2.07, 0.76)
  shape.lineTo(-1.91, 0.88)
  shape.lineTo(1.86, 0.88)
  shape.lineTo(2, 0.78)
  shape.lineTo(2.02, 0.44)
  shape.lineTo(1.91, 0.22)
  for (const axle of [wheelbase / 2, -wheelbase / 2]) {
    shape.lineTo(axle + opening, 0.22)
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
        slopeY = y > 0.77 ? -0.55 : y < 0.46 ? 0.25 : 0,
        slopeZ = Math.abs(z) > 1.85 ? -Math.sign(z) * 0.3 : 0
      const normal = new THREE.Vector3(
        normals.getX(i),
        normals.getY(i) - normals.getX(i) * side * slopeY,
        normals.getZ(i) - normals.getX(i) * side * slopeZ,
      ).normalize()
      positions.setX(i, positions.getX(i) + side * (halfWidth(y, z) - 0.0375))
      normals.setXYZ(i, normal.x, normal.y, normal.z)
    }
    group.add(new THREE.Mesh(geometry, paint))
    for (const axle of [-wheelbase / 2, wheelbase / 2]) {
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(opening - 0.012, opening - 0.012, 0.2, 24, 1, true, 0, Math.PI),
        wheelWell,
      )
      liner.rotation.z = Math.PI / 2
      liner.position.set(side * 0.66, wheelRadius, axle)
      group.add(liner)
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
    [rearProfile, 1],
    [
      [
        [0.22, -1.98],
        [0.44, -2.1],
        [0.76, -2.07],
        [0.88, -1.91],
      ],
      -1,
    ],
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
  return group
}
