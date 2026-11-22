import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { worldLoop, wrapOffset } from './field'
import { type Landscape, landscapeIds } from './landscapes'
import { random, shoreHeight, type World } from './world'

export type LandmarkKind =
  | 'lighthouse'
  | 'turbine'
  | 'mast'
  | 'cabin'
  | 'barn'
  | 'tower'
  | 'lookout'
  | 'cairn'

export interface Landmark {
  id: number
  kind: LandmarkKind
  x: number
  s: number
  height: number
  yaw: number
}

export const landmarkLayout = { slots: 8, nearest: 70, farthest: 250, found: 75 } as const

export const landmarkNames: Record<LandmarkKind, string> = {
  lighthouse: 'the lighthouse',
  turbine: 'a wind turbine',
  mast: 'the radio mast',
  cabin: 'a quiet cabin',
  barn: 'the red barn',
  tower: 'the water tower',
  lookout: 'the fire lookout',
  cairn: 'a stone cairn',
}

export const landmarkFootprints: Record<LandmarkKind, number> = {
  lighthouse: 2.6,
  turbine: 1.1,
  mast: 0.5,
  cabin: 3.2,
  barn: 4.6,
  tower: 2.2,
  lookout: 1.9,
  cairn: 1.2,
}

const pools: Record<Landscape, readonly LandmarkKind[]> = {
  highlands: ['lighthouse', 'barn', 'turbine', 'cabin', 'mast'],
  alpine: ['cabin', 'cairn', 'mast', 'lookout'],
  desert: ['tower', 'mast', 'turbine', 'cairn'],
  forest: ['lookout', 'cabin', 'cairn', 'mast'],
  canyon: ['tower', 'cairn', 'mast', 'cabin'],
  fjord: ['lighthouse', 'cabin', 'cairn', 'turbine'],
  jungle: ['lookout', 'cabin', 'cairn', 'tower'],
}

let cached: { key: string; list: Landmark[] } | null = null

export function lapLandmarks(world: World): Landmark[] {
  const { landscape, seed, roadMode } = world.settings
  const key = `${landscape}/${roadMode}/${seed}`
  if (cached?.key === key) return cached.list
  const list: Landmark[] = []
  const pool = pools[landscape]
  const { slots, nearest, farthest } = landmarkLayout
  for (let slot = 0; slot < slots; slot++) {
    const rng = random(seed * 7919 + slot * 104729 + landscapeIds.indexOf(landscape) * 31)
    const kind = pool[Math.floor(rng() * pool.length)] ?? 'cairn'
    for (let attempt = 0; attempt < 14; attempt++) {
      const s = ((slot + 0.25 + rng() * 0.5) * worldLoop.length) / slots
      const side = rng() > 0.5 ? 1 : -1
      const x = world.road(s).x + side * (nearest + rng() * (farthest - nearest))
      const surface = world.surface(x, s)
      const coastal = kind === 'lighthouse'
      if (surface.height < shoreHeight + 1.2) continue
      if (Math.hypot(surface.slopeX, surface.slopeS) > (coastal ? 0.5 : 0.3)) continue
      if (coastal && attempt < 9 && surface.height > 14) continue
      list.push({ id: slot, kind, x, s, height: surface.height, yaw: rng() * Math.PI * 2 })
      break
    }
  }
  cached = { key, list }
  return list
}

export function landmarkOffset(landmark: Landmark, x: number, s: number) {
  const along = landmark.s - s
  return {
    x: wrapOffset(landmark.x - x),
    s: along - worldLoop.length * Math.round(along / worldLoop.length),
  }
}

function part(geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const solid = geometry.index ? geometry.toNonIndexed() : geometry
  solid.deleteAttribute('uv')
  solid.translate(x, y, z)
  const tone = new THREE.Color(color)
  const count = solid.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let index = 0; index < count; index++) tone.toArray(colors, index * 3)
  solid.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  solid.computeVertexNormals()
  return solid
}

function gable(width: number, depth: number, rise: number, color: string, y: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(width / 2, 0)
  shape.lineTo(0, rise)
  shape.closePath()
  const roof = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  return part(roof, color, 0, y, -depth / 2)
}

const builders: Record<
  LandmarkKind,
  () => { body: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] }
> = {
  lighthouse: () => ({
    body: [
      part(new THREE.CylinderGeometry(1.5, 2.3, 5, 14), '#f1ede2', 0, 2.5),
      part(new THREE.CylinderGeometry(1.2, 1.5, 3, 14), '#c5483a', 0, 6.5),
      part(new THREE.CylinderGeometry(0.95, 1.2, 4, 14), '#f1ede2', 0, 10),
      part(new THREE.CylinderGeometry(1.5, 1.5, 0.25, 14), '#3a3f42', 0, 12.1),
      part(new THREE.ConeGeometry(1.25, 1.3, 14), '#c5483a', 0, 14.6),
    ],
    glow: [part(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 12), '#ffe9a8', 0, 13.1)],
  }),
  turbine: () => {
    const blades: THREE.BufferGeometry[] = []
    for (let index = 0; index < 3; index++) {
      const blade = new THREE.BoxGeometry(0.5, 13, 0.14)
      blade.translate(0, 6.9, 0)
      blade.rotateZ((index * Math.PI * 2) / 3 + 0.4)
      blades.push(part(blade, '#f4f4ee', 0, 30, 1.3))
    }
    return {
      body: [
        part(new THREE.CylinderGeometry(0.55, 1.05, 30, 12), '#eceee9', 0, 15),
        part(new THREE.BoxGeometry(1.1, 1.1, 3), '#e2e5e0', 0, 30, 0.2),
        part(new THREE.SphereGeometry(0.6, 10, 8), '#d5d9d4', 0, 30, 1.4),
        ...blades,
      ],
      glow: [],
    }
  },
  mast: () => ({
    body: [
      part(new THREE.CylinderGeometry(0.16, 0.34, 34, 6), '#c9cdc9', 0, 17),
      part(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 8), '#b8473b', 0, 22),
      part(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 8), '#b8473b', 0, 29),
      part(new THREE.BoxGeometry(2.4, 2.2, 2.4), '#8f9690', 3, 1.1),
    ],
    glow: [part(new THREE.SphereGeometry(0.32, 8, 6), '#ff5a48', 0, 34.2)],
  }),
  cabin: () => ({
    body: [
      part(new THREE.BoxGeometry(5.2, 2.6, 4.2), '#8a6a4b', 0, 1.3),
      gable(6, 4.8, 1.9, '#4f5a55', 2.6),
      part(new THREE.BoxGeometry(0.7, 2.2, 0.7), '#77736c', 1.5, 3.9, -0.9),
      part(new THREE.BoxGeometry(1, 1.9, 0.12), '#3c2f25', -1.1, 0.95, 2.12),
    ],
    glow: [part(new THREE.BoxGeometry(1.1, 0.9, 0.1), '#ffd98a', 1.2, 1.6, 2.13)],
  }),
  barn: () => ({
    body: [
      part(new THREE.BoxGeometry(8, 4.2, 6), '#a23b30', 0, 2.1),
      gable(8.8, 6.6, 3, '#55504a', 4.2),
      part(new THREE.BoxGeometry(2.6, 3, 0.14), '#f1ede2', 0, 1.5, 3.03),
      part(new THREE.CylinderGeometry(1.5, 1.5, 7, 12), '#d8d6cd', 6.2, 3.5),
      part(new THREE.ConeGeometry(1.6, 1.4, 12), '#8d9189', 6.2, 7.7),
    ],
    glow: [],
  }),
  tower: () => {
    const legs = [
      [1.5, 1.5],
      [-1.5, 1.5],
      [1.5, -1.5],
      [-1.5, -1.5],
    ].map(([x, z]) => part(new THREE.CylinderGeometry(0.14, 0.18, 9, 6), '#7d776c', x, 4.5, z))
    return {
      body: [
        ...legs,
        part(new THREE.CylinderGeometry(2.5, 2.3, 3.4, 16), '#c9c2b1', 0, 10.7),
        part(new THREE.ConeGeometry(2.7, 1.3, 16), '#8f7a62', 0, 13.05),
        part(new THREE.CylinderGeometry(0.2, 0.2, 9, 6), '#7d776c', 0, 4.5),
      ],
      glow: [],
    }
  },
  lookout: () => {
    const legs = [
      [1.4, 1.4],
      [-1.4, 1.4],
      [1.4, -1.4],
      [-1.4, -1.4],
    ].map(([x, z]) => part(new THREE.BoxGeometry(0.22, 11, 0.22), '#6f563d', x, 5.5, z))
    return {
      body: [
        ...legs,
        part(new THREE.BoxGeometry(4.4, 0.25, 4.4), '#7b6146', 0, 11),
        part(new THREE.BoxGeometry(3.4, 2.3, 3.4), '#8d6f4e', 0, 12.3),
        gable(4.6, 4.6, 1.3, '#3f4b44', 13.45),
        part(new THREE.BoxGeometry(3, 0.16, 0.16), '#6f563d', 0, 5.5, 1.4),
        part(new THREE.BoxGeometry(0.16, 0.16, 3), '#6f563d', 1.4, 7.5, 0),
      ],
      glow: [part(new THREE.BoxGeometry(3.45, 0.9, 3.45), '#ffe2a6', 0, 12.5)],
    }
  },
  cairn: () => ({
    body: [
      part(new THREE.DodecahedronGeometry(1.1, 0), '#8c8a83', 0, 0.7),
      part(new THREE.DodecahedronGeometry(0.85, 0), '#9a978f', 0.15, 1.9),
      part(new THREE.DodecahedronGeometry(0.62, 0), '#84827c', -0.1, 2.9),
      part(new THREE.DodecahedronGeometry(0.42, 0), '#a19e96', 0.05, 3.65),
      part(new THREE.DodecahedronGeometry(0.26, 0), '#8c8a83', 0, 4.15),
    ],
    glow: [],
  }),
}

export function landmarkGeometry(landmark: Landmark) {
  const built = builders[landmark.kind]()
  const settle = (parts: THREE.BufferGeometry[]) => {
    if (!parts.length) return null
    const merged = mergeGeometries(parts)
    for (const piece of parts) piece.dispose()
    if (!merged) throw new Error('Landmark geometry could not be merged')
    merged.rotateY(landmark.yaw)
    merged.translate(landmark.x, landmark.height - 0.15, -landmark.s)
    return merged
  }
  return { body: settle(built.body), glow: settle(built.glow) }
}
