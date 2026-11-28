import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { type RimFinish, rimFinishLooks, type WheelStyle } from './styling'

type FittedStyle = Exclude<WheelStyle, 'factory'>

interface RimParts {
  face: THREE.BufferGeometry
  barrel: THREE.BufferGeometry
}

const cache = new Map<FittedStyle, RimParts>()

function lathe(profile: [number, number][], segments = 40) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([radius, depth]) => new THREE.Vector2(radius, depth)),
    segments,
  )
  geometry.rotateZ(-Math.PI / 2)
  return geometry
}

function spoke(
  angle: number,
  inner: number,
  outer: number,
  rootWidth: number,
  tipWidth: number,
  depth: number,
  dish: number,
  twist = 0,
) {
  const shape = new THREE.Shape()
  shape.moveTo(inner, -rootWidth / 2)
  shape.lineTo(outer, -tipWidth / 2 + twist)
  shape.lineTo(outer, tipWidth / 2 + twist)
  shape.lineTo(inner, rootWidth / 2)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
  })
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index++) {
    const radius = position.getX(index)
    const lift = dish * (1 - (radius - inner) / Math.max(0.01, outer - inner))
    position.setZ(index, position.getZ(index) + lift)
  }
  geometry.computeVertexNormals()
  geometry.rotateZ(angle)
  geometry.rotateY(Math.PI / 2)
  return geometry
}

function curvedSpoke(
  angle: number,
  inner: number,
  outer: number,
  width: number,
  depth: number,
  sweep: number,
) {
  const steps = 6
  const shape = new THREE.Shape()
  const points: THREE.Vector2[] = []
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    const radius = inner + (outer - inner) * t
    const bend = sweep * t * t
    points.push(new THREE.Vector2(radius * Math.cos(bend), radius * Math.sin(bend)))
  }
  const half = width / 2
  const left = points.map((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)] ?? point
    const prev = points[Math.max(0, index - 1)] ?? point
    const along = next.clone().sub(prev).normalize()
    return point.clone().add(new THREE.Vector2(-along.y, along.x).multiplyScalar(half))
  })
  const right = points.map((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)] ?? point
    const prev = points[Math.max(0, index - 1)] ?? point
    const along = next.clone().sub(prev).normalize()
    return point.clone().add(new THREE.Vector2(along.y, -along.x).multiplyScalar(half))
  })
  const first = left[0] ?? new THREE.Vector2()
  shape.moveTo(first.x, first.y)
  for (const point of left.slice(1)) shape.lineTo(point.x, point.y)
  for (const point of right.reverse()) shape.lineTo(point.x, point.y)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false })
  geometry.rotateZ(angle)
  geometry.rotateY(Math.PI / 2)
  return geometry
}

function monoblockFace() {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, 0.9, 0, Math.PI * 2, false)
  const windows = 7
  for (let index = 0; index < windows; index++) {
    const angle = (index / windows) * Math.PI * 2
    const hole = new THREE.Path()
    const span = (Math.PI * 2) / windows
    const open = span * 0.3
    hole.absarc(0, 0, 0.82, angle - open, angle + open, false)
    hole.absarc(0, 0, 0.42, angle + open * 0.7, angle - open * 0.7, true)
    hole.closePath()
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    steps: 1,
    curveSegments: 48,
    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 2,
  })
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index++) {
    const radius = Math.hypot(position.getX(index), position.getY(index))
    position.setZ(index, position.getZ(index) + 0.08 * (1 - radius / 0.9))
  }
  geometry.computeVertexNormals()
  geometry.rotateY(Math.PI / 2)
  return geometry
}

function hub(nuts: number) {
  const parts: THREE.BufferGeometry[] = []
  const cap = lathe(
    [
      [0, 0.16],
      [0.12, 0.16],
      [0.2, 0.12],
      [0.22, 0.04],
      [0.22, -0.05],
      [0, -0.05],
    ],
    28,
  )
  parts.push(cap)
  for (let index = 0; index < nuts; index++) {
    const angle = (index / nuts) * Math.PI * 2 + Math.PI / nuts
    const nut = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6)
    nut.rotateZ(Math.PI / 2)
    nut.translate(0.17, Math.cos(angle) * 0.14, Math.sin(angle) * 0.14)
    parts.push(nut)
  }
  return parts
}

function nonIndexed(parts: THREE.BufferGeometry[]) {
  const ready = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part
    if (flat !== part) part.dispose()
    for (const name of Object.keys(flat.attributes))
      if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
    return flat
  })
  const merged = mergeGeometries(ready)
  for (const part of ready) part.dispose()
  if (!merged) throw new Error('Rim could not be assembled')
  return merged
}

export function rimParts(style: FittedStyle): RimParts {
  const known = cache.get(style)
  if (known) return known
  const face: THREE.BufferGeometry[] = []
  const lip = lathe([
    [0.9, -0.08],
    [0.98, -0.04],
    [1.02, 0.02],
    [0.98, 0.05],
    [0.92, 0.02],
  ])
  face.push(lip)
  if (style === 'blade')
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2
      for (const offset of [-0.13, 0.13])
        face.push(spoke(angle + offset, 0.2, 0.93, 0.11, 0.07, 0.08, 0.08, -offset * 0.25))
    }
  if (style === 'mesh') {
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2
      face.push(spoke(angle, 0.2, 0.93, 0.07, 0.05, 0.07, 0.05, 0.16))
      face.push(spoke(angle, 0.2, 0.93, 0.07, 0.05, 0.07, 0.05, -0.16))
    }
    face.push(
      lathe([
        [0.55, 0.02],
        [0.6, 0.04],
        [0.65, 0.02],
        [0.6, 0],
      ]),
    )
  }
  if (style === 'turbine')
    for (let index = 0; index < 16; index++)
      face.push(curvedSpoke((index / 16) * Math.PI * 2, 0.2, 0.93, 0.05, 0.08, 0.55))
  if (style === 'monoblock') face.push(monoblockFace())
  face.push(...hub(style === 'monoblock' ? 7 : 5))
  const barrel = lathe(
    [
      [0.92, 0.0],
      [0.9, -0.1],
      [0.88, -0.95],
      [0.95, -1.0],
      [0.95, -1.04],
      [0.0, -1.04],
    ],
    32,
  )
  const disc = lathe(
    [
      [0.18, -0.32],
      [0.74, -0.32],
      [0.74, -0.38],
      [0.18, -0.38],
    ],
    32,
  )
  const parts = { face: nonIndexed(face), barrel: nonIndexed([barrel, disc]) }
  cache.set(style, parts)
  return parts
}

export function rimMaterial(finish: RimFinish) {
  const look = rimFinishLooks[finish]
  return new THREE.MeshStandardMaterial({
    color: look.color,
    metalness: look.metalness,
    roughness: look.roughness,
    envMapIntensity: 1.2,
  })
}

export const rimShade = new THREE.MeshStandardMaterial({
  color: '#1b1d1f',
  roughness: 0.7,
  metalness: 0.3,
})

export interface TyreFit {
  inner: number
  width: number
  centre: number
}

export function measureTyre(spin: THREE.Object3D, isTyre: (mesh: THREE.Mesh) => boolean) {
  spin.updateMatrixWorld(true)
  const inverse = spin.matrixWorld.clone().invert()
  const point = new THREE.Vector3()
  let inner = Number.POSITIVE_INFINITY
  let outer = 0
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  spin.traverseVisible((part) => {
    if (!(part instanceof THREE.Mesh) || !isTyre(part)) return
    const placement = inverse.clone().multiply(part.matrixWorld)
    const position = part.geometry.getAttribute('position')
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(placement)
      const radius = Math.hypot(point.y, point.z)
      inner = Math.min(inner, radius)
      outer = Math.max(outer, radius)
      low = Math.min(low, point.x)
      high = Math.max(high, point.x)
    }
  })
  if (!Number.isFinite(inner) || outer <= 0) return null
  return { inner, width: high - low, centre: (high + low) / 2 } satisfies TyreFit
}

export function fitRim(
  style: FittedStyle,
  fit: TyreFit,
  outward: number,
  material: THREE.Material,
) {
  const parts = rimParts(style)
  const group = new THREE.Group()
  group.name = 'fitted-rim'
  const face = new THREE.Mesh(parts.face, material)
  const barrel = new THREE.Mesh(parts.barrel, rimShade)
  for (const mesh of [face, barrel]) {
    mesh.castShadow = true
    group.add(mesh)
  }
  const radius = fit.inner * 1.02
  const depth = fit.width * 0.86
  group.scale.set(outward * depth, radius, radius)
  group.position.x = fit.centre + (outward * fit.width) / 2 - outward * fit.width * 0.08
  return group
}
