import * as THREE from 'three'
import { busLayout } from './bus-layout'
import { carSurface } from './car-body'
import { vehicleMetrics } from './vehicles'

interface BusMaterials {
  paint: THREE.Material
  glass: THREE.Material
  trim: THREE.Material
  metal: THREE.Material
  well: THREE.Material
  brake: THREE.Material
  lights: THREE.Material
  plate: THREE.Material
}

const frontProfile = [
  [0.22, -4.33],
  [0.45, -4.46],
  [0.92, -4.46],
  [2.7, -4.02],
  [2.77, -4],
] as const
const rearProfile = [
  [0.22, 4.7],
  [0.45, 4.84],
  [2.45, 4.84],
  [2.77, 4.74],
] as const

function depth(profile: readonly (readonly [number, number])[], y: number) {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1],
      b = profile[i]
    if (a && b && y <= b[0])
      return THREE.MathUtils.lerp(
        a[1],
        b[1],
        THREE.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1),
      )
  }
  return profile.at(-1)?.[1] ?? 0
}

export function createBusBody(materials: BusMaterials) {
  const group = new THREE.Group()
  const { paint, glass, trim, metal, well, brake, lights, plate } = materials
  const { halfWidth, archRadius } = busLayout
  const metrics = vehicleMetrics.bus
  const corner = 0.1
  const side = new THREE.Shape()
  side.moveTo(frontProfile[0][1] + corner, frontProfile[0][0])
  for (const [y, z] of frontProfile.slice(1)) side.lineTo(z + corner, y)
  for (const [y, z] of [...rearProfile].reverse()) side.lineTo(z - corner, y)
  for (const axle of [metrics.wheelbase / 2, -metrics.wheelbase / 2]) {
    side.lineTo(axle + archRadius, 0.22)
    side.lineTo(axle + archRadius, metrics.wheelRadius)
    side.absarc(axle, metrics.wheelRadius, archRadius, 0, Math.PI, false)
    side.lineTo(axle - archRadius, 0.22)
  }
  side.closePath()
  for (const sign of [-1, 1]) {
    const geometry = new THREE.ExtrudeGeometry(side, {
      depth: 0.07,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.003,
      bevelSegments: 2,
      curveSegments: 20,
    })
    geometry.translate(0, 0, -0.035)
    geometry.rotateY(-Math.PI / 2)
    geometry.translate(sign * (halfWidth - 0.035), 0, 0)
    group.add(new THREE.Mesh(geometry, paint))
    for (const axle of [-metrics.wheelbase / 2, metrics.wheelbase / 2]) {
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(
          archRadius - 0.008,
          archRadius - 0.008,
          0.56,
          32,
          1,
          true,
          0,
          Math.PI,
        ),
        well,
      )
      liner.rotation.z = Math.PI / 2
      liner.position.set(sign * 0.88, metrics.wheelRadius, axle)
      group.add(liner)
      const wallShape = new THREE.Shape()
      wallShape.moveTo(-archRadius, metrics.wheelRadius)
      wallShape.absarc(0, metrics.wheelRadius, archRadius, Math.PI, 0, true)
      wallShape.closePath()
      const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape, 32), well)
      wall.rotation.y = (sign * Math.PI) / 2
      wall.position.set(sign * 0.6, 0, axle)
      group.add(wall)
    }
  }
  const end = (profile: readonly (readonly [number, number])[], direction: number) => {
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1],
        b = profile[i]
      if (!a || !b) continue
      const row = ([y, z]: readonly [number, number], sign: number): [number, number, number] => [
        sign * (halfWidth - corner),
        y,
        z,
      ]
      group.add(
        carSurface([row(a, -1), row(a, 1), row(b, 1), row(b, -1)], [0, 0, direction], paint),
      )
      for (const sign of [-1, 1])
        group.add(
          carSurface(
            [
              row(a, sign),
              [sign * halfWidth, a[0], a[1] - direction * corner],
              [sign * halfWidth, b[0], b[1] - direction * corner],
              row(b, sign),
            ],
            [sign, 0, direction],
            paint,
          ),
        )
    }
  }
  end(frontProfile, -1)
  end(rearProfile, 1)
  const roofRows = [
    [2.77, halfWidth, 4.74, -4],
    [2.89, 1.13, 4.65, -3.9],
    [busLayout.roof, 1, 4.5, -3.76],
  ] as const
  const ring = ([y, width, rear, front]: readonly [number, number, number, number]): [
    number,
    number,
    number,
  ][] => [
    [-width + corner, y, rear],
    [width - corner, y, rear],
    [width, y, rear - corner],
    [width, y, front + corner],
    [width - corner, y, front],
    [-width + corner, y, front],
    [-width, y, front + corner],
    [-width, y, rear - corner],
  ]
  for (let i = 1; i < roofRows.length; i++) {
    const a = roofRows[i - 1],
      b = roofRows[i]
    if (!a || !b) continue
    const lower = ring(a),
      upper = ring(b)
    for (let j = 0; j < 8; j++) {
      const n = (j + 1) % 8
      const p = lower[j],
        q = lower[n],
        r = upper[n],
        s = upper[j]
      if (p && q && r && s) group.add(carSurface([p, q, r, s], [p[0], 1, p[2]], paint))
    }
  }
  group.add(carSurface(ring(roofRows[2]), [0, 1, 0], paint))
  const frontPane = (
    left: number,
    right: number,
    low: number,
    high: number,
    material: THREE.Material,
    offset = 0.014,
  ) =>
    group.add(
      carSurface(
        [
          [left, low, depth(frontProfile, low) - offset],
          [right, low, depth(frontProfile, low) - offset],
          [right, high, depth(frontProfile, high) - offset],
          [left, high, depth(frontProfile, high) - offset],
        ],
        [0, 0, -1],
        material,
      ),
    )
  frontPane(-1.055, 1.055, 0.92, 2.72, trim)
  frontPane(-1.025, 1.025, 0.96, 2.68, glass, 0.022)
  const sidePane = (
    sign: number,
    points: [number, number][],
    material: THREE.Material,
    offset: number,
  ) => {
    const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateY(-Math.PI / 2)
    geometry.translate(sign * (halfWidth + offset), 0, 0)
    const index = geometry.index
    if (sign > 0 && index)
      for (let i = 0; i < index.count; i += 3) {
        const second = index.getX(i + 1)
        index.setX(i + 1, index.getX(i + 2))
        index.setX(i + 2, second)
      }
    geometry.computeVertexNormals()
    group.add(new THREE.Mesh(geometry, material))
  }
  for (const sign of [-1, 1]) {
    sidePane(
      sign,
      [
        [-4.34, 0.94],
        [-3.5, 0.9],
        [-3.07, 1.32],
        [-1.94, 1.74],
        [4.7, 1.74],
        [4.64, 2.73],
        [-3.9, 2.73],
      ],
      trim,
      0.006,
    )
    sidePane(
      sign,
      [
        [-4.29, 0.99],
        [-3.53, 0.95],
        [-3.1, 1.36],
        [-1.96, 1.78],
        [4.66, 1.78],
        [4.6, 2.69],
        [-3.88, 2.69],
      ],
      glass,
      0.012,
    )
  }
  const rearWindowRows = [1.75, 2.45, 2.68]
  const rearWindowPoint = (y: number, sign: number): [number, number, number] => [
    sign * THREE.MathUtils.lerp(1.055, 1.025, (y - 1.75) / 0.93),
    y,
    depth(rearProfile, y) + 0.014,
  ]
  for (let i = 1; i < rearWindowRows.length; i++) {
    const low = rearWindowRows[i - 1],
      high = rearWindowRows[i]
    if (low === undefined || high === undefined) continue
    group.add(
      carSurface(
        [
          rearWindowPoint(low, -1),
          rearWindowPoint(low, 1),
          rearWindowPoint(high, 1),
          rearWindowPoint(high, -1),
        ],
        [0, 0, 1],
        glass,
      ),
    )
  }
  const box = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...position)
    group.add(mesh)
    return mesh
  }
  for (const sign of [-1, 1]) {
    frontPane(sign * 0.55, sign * 0.95, 0.69, 0.81, lights, 0.04)
    box([0.28, 0.12, 0.028], [sign * 0.91, 1.02, 4.86], brake)
    box([0.28, 0.1, 0.028], [sign * 0.91, 0.87, 4.86], metal)
  }
  box([2.13, 0.13, 0.06], [0, 0.45, -4.46], trim)
  box([2.13, 0.13, 0.06], [0, 0.45, 4.85], trim)
  box([0.42, 0.13, 0.028], [0, 0.75, 4.86], plate)
  box([1.9, 0.045, metrics.wheelbase - archRadius * 2], [0, 0.25, 0], trim)
  for (const [from, to] of [
    [-4.3, -metrics.wheelbase / 2 - archRadius],
    [metrics.wheelbase / 2 + archRadius, 4.67],
  ]) {
    if (from === undefined || to === undefined) continue
    box([1.9, 0.045, to - from], [0, 0.25, (from + to) / 2], trim)
  }
  return group
}
