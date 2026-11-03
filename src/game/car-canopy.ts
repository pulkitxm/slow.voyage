import * as THREE from 'three'
import { subdividePlanarSurface } from './surface-subdivide'

type Point = [number, number]

const windowSegments = 4
const beltHeight = 0.88
const halfWidth = 0.71
const profile = new THREE.CubicInterpolant(
  new Float32Array([-0.95, -0.28, 0.15, 0.65, 1.32]),
  new Float32Array([beltHeight, 1.29, 1.34, 1.29, beltHeight]),
  1,
)

function canopyPoint(u: number, z: number, target: THREE.Vector3) {
  const height = profile.evaluate(z)[0] ?? beltHeight
  return target.set(
    u * halfWidth,
    beltHeight + (height - beltHeight) * Math.sqrt(Math.max(0, 1 - u ** 8)),
    z,
  )
}

function roundedWindow(points: Point[], inset = 0) {
  const center = points.reduce(
    (sum, point) => new THREE.Vector2(sum.x + point[0], sum.y + point[1]),
    new THREE.Vector2(),
  )
  center.divideScalar(points.length)
  const corners = points.map(
    ([x, y]) =>
      new THREE.Vector2(
        THREE.MathUtils.lerp(x, center.x, inset),
        THREE.MathUtils.lerp(y, center.y, inset),
      ),
  )
  const path = new THREE.Path()
  for (let index = 0; index < corners.length; index++) {
    const previous = corners[(index + corners.length - 1) % corners.length]
    const corner = corners[index]
    const next = corners[(index + 1) % corners.length]
    if (!previous || !corner || !next) continue
    const entry = corner.clone().lerp(previous, 0.075)
    const exit = corner.clone().lerp(next, 0.075)
    if (index === 0) path.moveTo(entry.x, entry.y)
    else path.lineTo(entry.x, entry.y)
    path.quadraticCurveTo(corner.x, corner.y, exit.x, exit.y)
  }
  path.closePath()
  return path
}

function canopyMesh(shape: THREE.Shape, material: THREE.Material) {
  const flat = new THREE.ShapeGeometry(shape, windowSegments)
  const geometry = subdividePlanarSurface(flat, 0.12)
  flat.dispose()
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  const point = new THREE.Vector3()
  const along = new THREE.Vector3()
  const across = new THREE.Vector3()
  const normal = new THREE.Vector3()
  for (let index = 0; index < positions.count; index++) {
    const u = positions.getX(index)
    const z = positions.getY(index)
    canopyPoint(u, z, point)
    canopyPoint(Math.min(1, u + 0.0001), z, across)
    canopyPoint(Math.max(-1, u - 0.0001), z, normal)
    across.sub(normal)
    canopyPoint(u, Math.min(1.32, z + 0.0001), along)
    canopyPoint(u, Math.max(-0.95, z - 0.0001), normal)
    along.sub(normal)
    normal.crossVectors(along, across).normalize()
    if (normal.lengthSq() < 0.5) normal.set(Math.sign(u), 0, 0)
    positions.setXYZ(index, point.x, point.y, point.z)
    normals.setXYZ(index, normal.x, normal.y, normal.z)
  }
  const indices = geometry.index
  if (!indices) throw new Error('Canopy topology is unavailable')
  for (let index = 0; index < indices.count; index += 3) {
    const second = indices.getX(index + 1)
    indices.setX(index + 1, indices.getX(index + 2))
    indices.setX(index + 2, second)
  }
  return new THREE.Mesh(geometry, material)
}

export function createCarCanopy(
  paint: THREE.Material,
  glass: THREE.Material,
  trim: THREE.Material,
) {
  const group = new THREE.Group()
  group.name = 'canopy'
  const shell = new THREE.Shape()
  shell.moveTo(-1, -0.95)
  shell.lineTo(1, -0.95)
  shell.lineTo(1, 1.32)
  shell.lineTo(-1, 1.32)
  shell.closePath()
  const windows: Point[][] = [
    [
      [-0.95, -0.835],
      [0.95, -0.835],
      [0.78, -0.19],
      [-0.78, -0.19],
    ],
    [
      [-0.74, 0.74],
      [0.74, 0.74],
      [0.86, 1.245],
      [-0.86, 1.245],
    ],
  ]
  for (const side of [-1, 1]) {
    for (const points of [
      [
        [0.9994, -0.7],
        [0.9994, 0.32],
        [0.82, 0.32],
        [0.82, -0.12],
      ],
      [
        [0.9994, 0.365],
        [0.9994, 1.05],
        [0.82, 0.57],
        [0.82, 0.365],
      ],
    ] as Point[][])
      windows.push(points.map(([u, z]) => [side * u, z]))
  }
  for (const points of windows) {
    const outer = roundedWindow(points)
    const inner = roundedWindow(points, 0.035)
    shell.holes.push(outer)
    const seal = new THREE.Shape(outer.getPoints(windowSegments))
    seal.holes.push(inner)
    group.add(canopyMesh(seal, trim))
    group.add(canopyMesh(new THREE.Shape(inner.getPoints(windowSegments)), glass))
  }
  group.add(canopyMesh(shell, paint))
  return group
}
