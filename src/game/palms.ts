import * as THREE from 'three'
import { random } from './world'

export const palmLayout = { nearest: 7, farthest: 85, trunk: 0.22, ferns: 3.4 } as const

function leaf(
  positions: number[],
  colors: number[],
  root: THREE.Vector3,
  yaw: number,
  length: number,
  rise: number,
  droop: number,
  width: number,
  tone: THREE.Color,
) {
  const segments = 7
  const outX = Math.sin(yaw)
  const outZ = Math.cos(yaw)
  const rows: [THREE.Vector3, THREE.Vector3, number][] = []
  for (let index = 0; index <= segments; index++) {
    const along = index / segments
    const reach = length * along
    const lift = rise * along - droop * along * along
    const spread = width * Math.sin(Math.PI * Math.min(1, along * 1.08)) ** 0.7 * (1 - along * 0.35)
    const centreX = root.x + outX * reach
    const centreZ = root.z + outZ * reach
    const y = root.y + lift
    const sag = spread * 0.28
    rows.push([
      new THREE.Vector3(centreX - outZ * spread, y - sag, centreZ + outX * spread),
      new THREE.Vector3(centreX + outZ * spread, y - sag, centreZ - outX * spread),
      along,
    ])
    rows.push([
      new THREE.Vector3(centreX, y, centreZ),
      new THREE.Vector3(centreX, y, centreZ),
      along,
    ])
  }
  const push = (point: THREE.Vector3, along: number) => {
    positions.push(point.x, point.y, point.z)
    const shade = 0.62 + along * 0.5
    colors.push(tone.r * shade, tone.g * shade, tone.b * shade)
  }
  for (let index = 0; index < segments; index++) {
    const edge = rows[index * 2]
    const spine = rows[index * 2 + 1]
    const nextEdge = rows[index * 2 + 2]
    const nextSpine = rows[index * 2 + 3]
    if (!edge || !spine || !nextEdge || !nextSpine) continue
    for (const side of [0, 1] as const) {
      const a = edge[side]
      const b = nextEdge[side]
      push(a, edge[2])
      push(spine[0], spine[2])
      push(b, nextEdge[2])
      push(spine[0], spine[2])
      push(nextSpine[0], nextSpine[2])
      push(b, nextEdge[2])
    }
  }
}

function finish(positions: number[], colors: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function palmGeometry(seed: number) {
  const rng = random(seed * 613 + 41)
  const positions: number[] = []
  const colors: number[] = []
  const height = 7 + rng() * 4
  const lean = 0.6 + rng() * 1.4
  const heading = rng() * Math.PI * 2
  const bark = new THREE.Color('#8f775c')
  const rings = 9
  const radial = 7
  const ring = (index: number) => {
    const along = index / rings
    const radius = palmLayout.trunk * (1 - along * 0.45) * (index === 0 ? 1.5 : 1)
    const bend = lean * along * along
    return Array.from({ length: radial }, (_, step) => {
      const angle = (step / radial) * Math.PI * 2
      return new THREE.Vector3(
        Math.sin(heading) * bend + Math.cos(angle) * radius,
        height * along,
        Math.cos(heading) * bend + Math.sin(angle) * radius,
      )
    })
  }
  for (let index = 0; index < rings; index++) {
    const lower = ring(index)
    const upper = ring(index + 1)
    const shade = 0.75 + (index % 2) * 0.22
    for (let step = 0; step < radial; step++) {
      const a = lower[step]
      const b = lower[(step + 1) % radial]
      const c = upper[step]
      const d = upper[(step + 1) % radial]
      if (!a || !b || !c || !d) continue
      for (const point of [a, c, b, b, c, d]) {
        positions.push(point.x, point.y, point.z)
        colors.push(bark.r * shade, bark.g * shade, bark.b * shade)
      }
    }
  }
  const crown = new THREE.Vector3(Math.sin(heading) * lean, height, Math.cos(heading) * lean)
  const fronds = 13
  for (let index = 0; index < fronds; index++) {
    const upright = index % 3 === 0
    const tone = new THREE.Color().setHSL(0.27 + rng() * 0.05, 0.55, 0.26 + rng() * 0.1)
    leaf(
      positions,
      colors,
      crown,
      (index / fronds) * Math.PI * 2 + rng() * 0.4,
      3.6 + rng() * 1.5,
      upright ? 2.2 + rng() : 0.7 + rng() * 0.8,
      upright ? 2.6 + rng() : 2.8 + rng() * 1.8,
      0.55 + rng() * 0.2,
      tone,
    )
  }
  return finish(positions, colors)
}

export function fernGeometry(seed: number) {
  const rng = random(seed * 271 + 7)
  const positions: number[] = []
  const colors: number[] = []
  const fronds = 9
  for (let index = 0; index < fronds; index++)
    leaf(
      positions,
      colors,
      new THREE.Vector3(0, 0.05, 0),
      (index / fronds) * Math.PI * 2 + rng() * 0.5,
      0.9 + rng() * 0.6,
      0.6 + rng() * 0.4,
      0.55 + rng() * 0.4,
      0.2 + rng() * 0.08,
      new THREE.Color().setHSL(0.29 + rng() * 0.05, 0.62, 0.14 + rng() * 0.07),
    )
  return finish(positions, colors)
}

export function palmMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.82,
  })
}
