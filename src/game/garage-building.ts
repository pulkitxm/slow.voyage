import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Trunk } from './collision'
import { type Garage, type GarageFrame, garageFrame, garageLayout, garagePoint } from './garages'
import { groundSurface } from './ground-grid'
import type { World } from './world'

export const garagePalette = {
  wall: '#dcd6c8',
  plinth: '#55595c',
  roof: '#3a3f43',
  stripe: '#b8352a',
  frame: '#2b2f33',
  floor: '#a3a19a',
  apron: '#77756f',
  line: '#e9e3cf',
  steel: '#8d9398',
  cabinet: '#b8352a',
  bench: '#6b5340',
  rubber: '#1d1e1f',
  drum: '#2f5f8a',
  shutter: '#9aa0a3',
  glass: '#1c2a33',
} as const

class Kit {
  parts: THREE.BufferGeometry[] = []
  constructor(private side: 1 | -1) {}
  paint(geometry: THREE.BufferGeometry, color: string) {
    const solid = geometry.index ? geometry.toNonIndexed() : geometry
    if (solid !== geometry) geometry.dispose()
    solid.deleteAttribute('uv')
    const tone = new THREE.Color(color)
    const count = solid.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    for (let index = 0; index < count; index++) tone.toArray(colors, index * 3)
    solid.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return solid
  }
  box(color: string, u: number, y: number, v: number, along: number, high: number, across: number) {
    const geometry = new THREE.BoxGeometry(across, high, along)
    geometry.translate(this.side * v, y + high / 2, -u)
    this.parts.push(this.paint(geometry, color))
  }
  drum(color: string, u: number, y: number, v: number, radius: number, high: number, sides = 14) {
    const geometry = new THREE.CylinderGeometry(radius, radius, high, sides)
    geometry.translate(this.side * v, y + high / 2, -u)
    this.parts.push(this.paint(geometry, color))
  }
  tyre(u: number, y: number, v: number, radius: number, width: number, flat = true) {
    const geometry = new THREE.TorusGeometry(radius - width / 2, width / 2, 6, 16)
    if (flat) geometry.rotateX(Math.PI / 2)
    else geometry.rotateY(Math.PI / 2)
    geometry.scale(1, flat ? 1.5 : 1, 1)
    geometry.translate(this.side * v, y, -u)
    this.parts.push(this.paint(geometry, garagePalette.rubber))
  }
  build() {
    const merged = mergeGeometries(this.parts)
    for (const part of this.parts) part.dispose()
    this.parts = []
    if (!merged) throw new Error('Garage could not be assembled')
    merged.computeVertexNormals()
    return merged
  }
}

function apronGeometry(world: World, frame: GarageFrame) {
  const { apron, front } = garageLayout
  const columns = 16
  const rows = 6
  const positions: number[] = []
  const colors: number[] = []
  const tone = new THREE.Color(garagePalette.apron)
  const line = new THREE.Color(garagePalette.line)
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const u = -apron.u + (2 * apron.u * column) / columns
      const v = apron.v + ((front + 0.2 - apron.v) * row) / rows
      const point = garagePoint(frame, u, v)
      const ground =
        groundSurface(world, point.x, point.s)?.height ?? world.height(point.x, point.s)
      const edge = row === rows ? frame.y - 0.02 : ground + 0.05
      positions.push(frame.side * v, edge - frame.y, -u)
      const painted = row >= rows - 3 && Math.abs(u - garageLayout.bay.u) < 3.1
      ;(painted && (column === 3 || column === 7) ? line : tone).toArray(colors, colors.length)
    }
  const indices: number[] = []
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column
      const b = a + 1
      const c = a + columns + 1
      const d = c + 1
      if (frame.side > 0) indices.push(a, c, b, b, c, d)
      else indices.push(a, b, c, b, d, c)
    }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function garageSign() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#7d1f18'
    context.fillRect(0, 0, 1024, 160)
    context.fillStyle = '#f4efe2'
    context.fillRect(0, 140, 1024, 6)
    context.font = '700 78px "DM Sans", "Manrope", sans-serif'
    context.textBaseline = 'middle'
    context.textAlign = 'center'
    context.fillText('SERVICE  ·  WASH  ·  PAINT', 512, 76)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export interface GarageMaterials {
  body: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
  sign: THREE.MeshStandardMaterial
  pool: THREE.MeshBasicMaterial
}

export function garageMaterials(): GarageMaterials {
  const sign = garageSign()
  return {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.04 }),
    glass: new THREE.MeshStandardMaterial({
      color: garagePalette.glass,
      roughness: 0.12,
      metalness: 0.5,
      emissive: '#ffd9a0',
      emissiveIntensity: 0,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: '#f4f1e6',
      emissive: '#fff6e0',
      emissiveIntensity: 0.6,
    }),
    sign: new THREE.MeshStandardMaterial({
      map: sign,
      emissiveMap: sign,
      emissive: '#ffffff',
      emissiveIntensity: 0.15,
      roughness: 0.6,
    }),
    pool: new THREE.MeshBasicMaterial({
      color: '#ffdcaa',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  }
}

export function buildGarage(world: World, garage: Garage, lap: number, materials: GarageMaterials) {
  const frame = garageFrame(world, garage, lap)
  const side = garage.side
  const { front, back, half, door, bay } = garageLayout
  const depth = back - front
  const middle = (front + back) / 2
  const wallHeight = 5.2
  const kit = new Kit(side)
  const shine = new Kit(side)
  const panes = new Kit(side)
  kit.box(garagePalette.plinth, 0, -3, middle, 2 * half + 0.4, 3.08, depth + 0.4)
  kit.box(garagePalette.floor, 0, 0, middle, 2 * half, 0.06, depth)
  kit.box(garagePalette.wall, 0, 0, back - 0.15, 2 * half, wallHeight, 0.3)
  for (const end of [-half, half])
    kit.box(garagePalette.wall, end, 0, middle, 0.3, wallHeight, depth)
  kit.box(garagePalette.plinth, 0, 0, front - 0.05, 2 * half + 0.3, 0.7, 0.32)
  kit.box(
    garagePalette.wall,
    (door.from - half) / 2,
    0.7,
    front,
    door.from + half,
    wallHeight - 0.7,
    0.3,
  )
  kit.box(garagePalette.wall, 0, door.height, front, 2 * half, wallHeight - door.height, 0.3)
  kit.box(garagePalette.wall, (door.to + 0.6) / 2, 0.7, front, 0.6 - door.to, wallHeight - 0.7, 0.3)
  kit.box(garagePalette.wall, (8.2 + half) / 2, 0.7, front, half - 8.2, wallHeight - 0.7, 0.3)
  kit.box(garagePalette.wall, 4.4, 2.9, front, 7.6, wallHeight - 2.9, 0.3)
  kit.box(garagePalette.wall, 2.2, 0.7, front, 0.5, 2.2, 0.3)
  panes.box(garagePalette.glass, 1.15, 0.7, front, 1.6, 2.2, 0.08)
  panes.box(garagePalette.glass, 5.3, 0.9, front, 5.8, 2.0, 0.08)
  kit.box(garagePalette.frame, 5.3, 0.82, front - 0.06, 6.0, 0.1, 0.2)
  kit.box(garagePalette.frame, 5.3, 2.9, front - 0.06, 6.0, 0.08, 0.2)
  for (const post of [2.4, 4.3, 6.3, 8.2])
    kit.box(garagePalette.frame, post, 0.9, front - 0.04, 0.08, 2, 0.16)
  kit.box(garagePalette.frame, 1.15, 0, front - 0.06, 1.75, 2.95, 0.12)
  for (const edge of [door.from - 0.12, door.to + 0.12])
    kit.box(garagePalette.frame, edge, 0, front - 0.05, 0.24, door.height + 0.1, 0.36)
  kit.box(
    garagePalette.frame,
    (door.from + door.to) / 2,
    door.height,
    front - 0.05,
    door.to - door.from + 0.5,
    0.22,
    0.4,
  )
  kit.box(
    garagePalette.shutter,
    (door.from + door.to) / 2,
    door.height + 0.22,
    front - 0.32,
    door.to - door.from + 0.2,
    0.5,
    0.5,
  )
  kit.box(garagePalette.roof, 0, wallHeight, middle - 0.6, 2 * half + 0.8, 0.28, depth + 1.8)
  kit.box(garagePalette.stripe, 0, wallHeight - 0.45, front - 0.17, 2 * half + 0.34, 0.45, 0.06)
  kit.box(garagePalette.stripe, 0, wallHeight - 0.45, back + 0.02, 2 * half + 0.34, 0.45, 0.06)
  const lift = bay.u
  for (const offset of [-1.75, 1.75]) {
    kit.box(garagePalette.steel, lift + offset, 0.06, bay.v, 0.32, 3.6, 0.32)
    kit.box(garagePalette.steel, lift + offset, 0.06, bay.v, 0.7, 0.08, 0.7)
    kit.box(garagePalette.frame, lift + offset * 0.72, 0.3, bay.v - 0.7, 0.9, 0.08, 0.14)
    kit.box(garagePalette.frame, lift + offset * 0.72, 0.3, bay.v + 0.7, 0.9, 0.08, 0.14)
  }
  kit.box(garagePalette.steel, lift, 3.66, bay.v, 3.9, 0.2, 0.26)
  for (const [u, v, high] of [
    [-8.2, back - 0.75, 1.05],
    [-7.3, back - 0.75, 1.5],
    [-6.4, back - 0.75, 1.05],
  ] as const) {
    kit.box(garagePalette.cabinet, u, 0.06, v, 0.85, high, 0.75)
    for (let drawer = 0.25; drawer < high - 0.1; drawer += 0.2)
      kit.box(garagePalette.steel, u, 0.06 + drawer, v - 0.39, 0.6, 0.03, 0.03)
  }
  kit.box(garagePalette.bench, -1.2, 0.95, back - 0.6, 3.2, 0.08, 0.9)
  for (const leg of [-2.6, 0.2]) kit.box(garagePalette.frame, leg, 0.06, back - 0.6, 0.08, 0.9, 0.8)
  kit.box(garagePalette.frame, -1.2, 1.2, back - 0.33, 3.2, 1.3, 0.04)
  for (let tool = 0; tool < 7; tool++)
    kit.box(
      garagePalette.steel,
      -2.5 + tool * 0.42,
      1.55 + (tool % 3) * 0.18,
      back - 0.37,
      0.05,
      0.38,
      0.03,
    )
  for (let layer = 0; layer < 5; layer++)
    kit.tyre(1.4 + 0.02 * layer, 0.2 + layer * 0.27, back - 0.75, 0.34, 0.24)
  for (let layer = 0; layer < 4; layer++) kit.tyre(2.2, 0.2 + layer * 0.27, back - 0.75, 0.34, 0.24)
  for (let layer = 0; layer < 3; layer++)
    kit.tyre(-8.2, 0.2 + layer * 0.27, front + 1.2, 0.32, 0.22)
  kit.drum(garagePalette.drum, -8.3, 0.06, front + 2.6, 0.3, 0.9)
  kit.drum(garagePalette.drum, -8.3, 0.06, front + 3.3, 0.3, 0.9)
  kit.drum('#c9a23a', -7.7, 0.06, front + 3.0, 0.3, 0.9)
  kit.box('#c33a2c', -8.3, 0.06, front + 4.4, 0.5, 0.95, 0.6)
  kit.drum(garagePalette.rubber, -8.3, 0.25, front + 4.4, 0.24, 0.1)
  for (let rack = 0; rack < 4; rack++)
    kit.tyre(3.1 + rack * 1.2, 1.4, front - 1.0, 0.33, 0.22, false)
  kit.box(garagePalette.frame, 4.9, 0.06, front - 1.0, 4.6, 0.08, 0.5)
  for (const post of [2.7, 7.1])
    kit.box(garagePalette.frame, post, 0.06, front - 1.0, 0.08, 1.8, 0.08)
  kit.box(garagePalette.frame, 4.9, 1.86, front - 1.0, 4.6, 0.06, 0.08)
  kit.box(
    garagePalette.plinth,
    garageLayout.apron.u - 2.2,
    0,
    garageLayout.apron.v + 0.6,
    0.18,
    4.4,
    0.18,
  )
  kit.box(
    garagePalette.frame,
    garageLayout.apron.u - 2.2,
    4.3,
    garageLayout.apron.v + 0.6,
    2.2,
    1.0,
    0.16,
  )
  for (const [u, v] of [
    [-6, bay.v - 1.8],
    [-3, bay.v - 1.8],
    [-6, bay.v + 1.8],
    [-3, bay.v + 1.8],
    [4, middle],
  ] as const)
    shine.box('#ffffff', u, wallHeight - 0.12, v, 1.6, 0.06, 0.14)
  const body = new THREE.Mesh(kit.build(), materials.body)
  const glow = new THREE.Mesh(shine.build(), materials.glow)
  const glass = new THREE.Mesh(panes.build(), materials.glass)
  const apron = new THREE.Mesh(apronGeometry(world, frame), materials.body)
  const signGeometry = new THREE.PlaneGeometry(2 * half - 1, 1.1)
  if (side < 0) signGeometry.rotateY(Math.PI)
  const sign = new THREE.Mesh(signGeometry, materials.sign)
  sign.position.set(side * (front - 0.24), wallHeight - 0.62, 0)
  sign.rotation.y = -Math.PI / 2
  const pole = new THREE.PlaneGeometry(2.0, 0.82)
  const roadSign = new THREE.Mesh(pole, materials.sign)
  roadSign.position.set(side * (garageLayout.apron.v + 0.6), 4.8, -(garageLayout.apron.u - 2.2))
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), materials.pool)
  pool.rotation.x = -Math.PI / 2
  pool.position.set(side * bay.v, 0.075, -bay.u)
  const group = new THREE.Group()
  group.add(body, glow, glass, apron, sign, roadSign, pool)
  group.position.set(frame.x, frame.y, -frame.s)
  group.rotation.y = frame.yaw
  body.castShadow = true
  body.receiveShadow = true
  apron.receiveShadow = true
  glass.receiveShadow = true
  const trunks: Trunk[] = []
  const block = (u: number, v: number, radius: number) => {
    const point = garagePoint(frame, u, v)
    trunks.push({ x: point.x, s: point.s, radius })
  }
  for (let u = -half; u <= half; u += 1.6) {
    block(u, front + 0.6, 0.9)
    block(u, back - 0.6, 0.9)
  }
  for (let v = front + 0.6; v <= back; v += 1.6) {
    block(-half + 0.6, v, 0.9)
    block(half - 0.6, v, 0.9)
  }
  block(garageLayout.apron.u - 2.2, garageLayout.apron.v + 0.6, 0.2)
  return { group, trunks, frame }
}
