import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { random } from './world'

export const species = ['cow', 'sheep', 'deer', 'horse', 'goat', 'camel', 'elephant'] as const
export type Species = (typeof species)[number]
export type Creature = Species | 'person'

interface Part {
  geometry: THREE.BufferGeometry
  color: THREE.ColorRepresentation
  dye?: number
  rig?: [pivotY: number, pivotZ: number, swing: number, neck: number]
  knee?: [height: number, weight: number]
  blotch?: number
}

function assemble(parts: Part[], seed: number) {
  const rng = random(seed)
  const shift = [rng() * 40, rng() * 40, rng() * 40]
  const tone = new THREE.Color()
  const prepared = parts.map((part) => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry
    if (geometry !== part.geometry) part.geometry.dispose()
    geometry.deleteAttribute('uv')
    const position = geometry.getAttribute('position')
    const count = position.count
    const colors = new Float32Array(count * 3)
    const rig = new Float32Array(count * 4)
    const knee = new Float32Array(count * 2)
    const dye = new Float32Array(count)
    tone.set(part.color)
    for (let index = 0; index < count; index++) {
      colors.set([tone.r, tone.g, tone.b], index * 3)
      rig.set(part.rig ?? [0, 0, 0, 0], index * 4)
      knee.set(part.knee ?? [0, 0], index * 2)
      let marked = part.dye ?? 0
      if (part.blotch) {
        const wave =
          Math.sin(position.getX(index) * 2.1 + (shift[0] ?? 0)) *
            Math.sin(position.getZ(index) * 2.6 + (shift[2] ?? 0)) +
          Math.sin(position.getY(index) * 3.4 + position.getZ(index) * 1.7 + (shift[1] ?? 0)) * 0.7
        if (wave > part.blotch) marked = 2
      }
      dye[index] = marked
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('rig', new THREE.BufferAttribute(rig, 4))
    geometry.setAttribute('knee', new THREE.BufferAttribute(knee, 2))
    geometry.setAttribute('dye', new THREE.BufferAttribute(dye, 1))
    return geometry
  })
  const merged = mergeGeometries(prepared)
  if (!merged) throw new Error('Creature geometry could not be assembled')
  for (const geometry of prepared) geometry.dispose()
  return merged
}

function capsule(radius: number, length: number, radial = 10) {
  return new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 4, radial)
}

export function personGeometry() {
  const parts: Part[] = []
  for (const side of [-1, 1]) {
    const hip: [number, number, number, number] = [0.92, 0, side, 0]
    parts.push({
      geometry: capsule(0.078, 0.34).translate(side * 0.095, 0.71, 0),
      color: '#ffffff',
      dye: 2,
      rig: hip,
      knee: [0.5, 0],
    })
    parts.push({
      geometry: capsule(0.06, 0.34).translate(side * 0.095, 0.27, 0),
      color: '#ffffff',
      dye: 2,
      rig: hip,
      knee: [0.5, 1],
    })
    parts.push({
      geometry: new THREE.BoxGeometry(0.095, 0.075, 0.25).translate(side * 0.095, 0.038, 0.055),
      color: '#2b2622',
      rig: hip,
      knee: [0.5, 1],
    })
    const shoulder: [number, number, number, number] = [1.4, 0, -side * 0.85, 0]
    parts.push({
      geometry: capsule(0.047, 0.46).translate(side * 0.245, 1.14, 0),
      color: '#ffffff',
      dye: 1,
      rig: shoulder,
    })
    parts.push({
      geometry: new THREE.SphereGeometry(0.048, 8, 6).translate(side * 0.245, 0.85, 0),
      color: '#ffffff',
      dye: 3,
      rig: shoulder,
    })
  }
  parts.push({
    geometry: capsule(0.14, 0.1).scale(1.12, 1, 0.74).translate(0, 0.96, 0),
    color: '#ffffff',
    dye: 2,
  })
  parts.push({
    geometry: capsule(0.155, 0.3, 12).scale(1.16, 1, 0.7).translate(0, 1.22, 0),
    color: '#ffffff',
    dye: 1,
  })
  parts.push({
    geometry: new THREE.CylinderGeometry(0.047, 0.052, 0.09, 8).translate(0, 1.48, 0),
    color: '#ffffff',
    dye: 3,
  })
  parts.push({
    geometry: new THREE.SphereGeometry(0.105, 12, 10)
      .scale(0.94, 1.14, 1)
      .translate(0, 1.62, 0.005),
    color: '#ffffff',
    dye: 3,
  })
  parts.push({
    geometry: new THREE.SphereGeometry(0.113, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52)
      .scale(0.96, 1.12, 1.04)
      .rotateX(-0.35)
      .translate(0, 1.635, -0.012),
    color: '#2a211b',
  })
  parts.push({
    geometry: new THREE.BoxGeometry(0.27, 0.36, 0.13).translate(0, 1.2, -0.17),
    color: '#ffffff',
    dye: 2,
  })
  return assemble(parts, 11)
}

interface Build {
  length: number
  back: number
  girth: number
  leg: number
  legWidth: number
  neck: number
  neckLift: number
  head: number
  coat: THREE.ColorRepresentation
  face: THREE.ColorRepresentation
  blotch?: number
  hump?: number
  trunk?: number
  horns?: number
  wool?: number
  tail: number
}

const builds: Record<Species, Build> = {
  cow: {
    length: 2.05,
    back: 1.38,
    girth: 0.37,
    leg: 0.74,
    legWidth: 0.07,
    neck: 0.55,
    neckLift: 0.35,
    head: 0.2,
    coat: '#ffffff',
    face: '#ffffff',
    blotch: 0.15,
    horns: 0.1,
    tail: 0.75,
  },
  sheep: {
    length: 1.1,
    back: 0.78,
    girth: 0.3,
    leg: 0.36,
    legWidth: 0.04,
    neck: 0.25,
    neckLift: 0.5,
    head: 0.13,
    coat: '#ffffff',
    face: '#3a332d',
    wool: 1.12,
    tail: 0.12,
  },
  deer: {
    length: 1.35,
    back: 1.02,
    girth: 0.21,
    leg: 0.68,
    legWidth: 0.035,
    neck: 0.5,
    neckLift: 1.05,
    head: 0.13,
    coat: '#ffffff',
    face: '#ffffff',
    horns: 0.28,
    tail: 0.14,
  },
  horse: {
    length: 2.05,
    back: 1.52,
    girth: 0.3,
    leg: 0.95,
    legWidth: 0.055,
    neck: 0.8,
    neckLift: 0.8,
    head: 0.17,
    coat: '#ffffff',
    face: '#ffffff',
    tail: 0.8,
  },
  goat: {
    length: 1.02,
    back: 0.72,
    girth: 0.19,
    leg: 0.4,
    legWidth: 0.032,
    neck: 0.28,
    neckLift: 0.85,
    head: 0.11,
    coat: '#ffffff',
    face: '#ffffff',
    horns: 0.16,
    tail: 0.1,
  },
  camel: {
    length: 2.3,
    back: 1.8,
    girth: 0.34,
    leg: 1.2,
    legWidth: 0.06,
    neck: 0.95,
    neckLift: 0.95,
    head: 0.2,
    coat: '#ffffff',
    face: '#ffffff',
    hump: 0.34,
    tail: 0.5,
  },
  elephant: {
    length: 3,
    back: 2.55,
    girth: 0.72,
    leg: 1.3,
    legWidth: 0.125,
    neck: 0.42,
    neckLift: 0.3,
    head: 0.4,
    coat: '#ffffff',
    face: '#ffffff',
    trunk: 1.35,
    tail: 0.95,
  },
}

export const creatureRadius: Record<Creature, number> = {
  person: 0.3,
  cow: 0.75,
  sheep: 0.45,
  deer: 0.45,
  horse: 0.75,
  goat: 0.4,
  camel: 0.8,
  elephant: 1.2,
}

type Ring = [y: number, z: number, wide: number, tall: number]

function smoothRings(rings: Ring[], steps: number) {
  const at = (index: number) => rings[Math.max(0, Math.min(rings.length - 1, index))] as Ring
  const result: Ring[] = []
  for (let segment = 0; segment < rings.length - 1; segment++)
    for (let step = 0; step < steps; step++) {
      const u = step / steps
      const blend = (channel: number) => {
        const a = at(segment - 1)[channel] ?? 0
        const b = at(segment)[channel] ?? 0
        const c = at(segment + 1)[channel] ?? 0
        const d = at(segment + 2)[channel] ?? 0
        return (
          0.5 *
          (2 * b +
            (c - a) * u +
            (2 * a - 5 * b + 4 * c - d) * u * u +
            (3 * b - a - 3 * c + d) * u * u * u)
        )
      }
      result.push([blend(0), blend(1), Math.max(0.004, blend(2)), Math.max(0.004, blend(3))])
    }
  result.push(at(rings.length - 1))
  return result
}

function tube(path: Ring[], radial: number, x = 0, steps = 1) {
  const rings = steps > 1 ? smoothRings(path, steps) : path
  const positions: number[] = []
  const indices: number[] = []
  for (const [index, [y, z, wide, tall]] of rings.entries()) {
    const before = rings[Math.max(0, index - 1)] as Ring
    const after = rings[Math.min(rings.length - 1, index + 1)] as Ring
    const alongY = after[0] - before[0]
    const alongZ = after[1] - before[1]
    const length = Math.hypot(alongY, alongZ) || 1
    const upY = alongZ / length
    const upZ = -alongY / length
    for (let step = 0; step < radial; step++) {
      const angle = (step / radial) * Math.PI * 2
      const lift = Math.sin(angle) * tall
      positions.push(x + Math.cos(angle) * wide, y + upY * lift, z + upZ * lift)
    }
  }
  const first = rings[0] as Ring
  const last = rings[rings.length - 1] as Ring
  positions.push(x, first[0], first[1], x, last[0], last[1])
  const start = rings.length * radial
  for (let ring = 0; ring < rings.length - 1; ring++)
    for (let step = 0; step < radial; step++) {
      const a = ring * radial + step
      const b = ring * radial + ((step + 1) % radial)
      indices.push(a, b, a + radial, b, b + radial, a + radial)
    }
  for (let step = 0; step < radial; step++) {
    const next = (step + 1) % radial
    indices.push(start, next, step)
    indices.push(start + 1, (rings.length - 1) * radial + step, (rings.length - 1) * radial + next)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function animalGeometry(kind: Species) {
  const build = builds[kind]
  const { length, back, girth, leg, legWidth } = build
  const spine = back - girth
  const parts: Part[] = []
  const bulk = girth * (build.wool ?? 1)
  const half = length / 2
  parts.push({
    geometry: tube(
      [
        [spine + bulk * 0.2, -half, bulk * 0.3, bulk * 0.3],
        [spine + bulk * 0.06, -half * 0.86, bulk * 0.78, bulk * 0.84],
        [spine - bulk * 0.02, -half * 0.45, bulk * 0.94, bulk * 1.0],
        [spine - bulk * 0.12, half * 0.05, bulk * 1.02, bulk * 1.08],
        [spine - bulk * 0.05, half * 0.52, bulk * 0.92, bulk * 1.06],
        [spine + bulk * 0.04, half * 0.84, bulk * 0.7, bulk * 0.88],
        [spine + bulk * 0.1, half, bulk * 0.36, bulk * 0.45],
      ],
      16,
      0,
      3,
    ),
    color: build.coat,
    dye: 1,
    ...(build.blotch === undefined ? {} : { blotch: build.blotch }),
  })
  if (build.hump)
    parts.push({
      geometry: new THREE.SphereGeometry(build.hump, 12, 8)
        .scale(0.78, 1.15, 1.3)
        .translate(0, spine + girth * 0.8, -0.05),
      color: build.coat,
      dye: 1,
    })
  const reach = half - girth * 0.8
  const legDye = kind === 'sheep' ? 0 : 1
  const legColor = kind === 'sheep' ? build.face : build.coat
  for (const end of [-1, 1])
    for (const side of [-1, 1]) {
      const z = end * reach
      const hock = end < 0 ? -leg * 0.07 : leg * 0.02
      parts.push({
        geometry: tube(
          [
            [leg * 1.12, z, legWidth * 2.6, legWidth * 3.2],
            [leg * 0.8, z, legWidth * 1.9, legWidth * 2.3],
            [leg * 0.52, z + hock, legWidth * 1.15, legWidth * 1.3],
            [leg * 0.28, z + hock * 0.4, legWidth * 0.8, legWidth * 0.85],
            [leg * 0.07, z, legWidth * 0.82, legWidth * 0.9],
            [0, z + legWidth * 0.3, legWidth * 1.1, legWidth * 1.25],
          ],
          8,
          side * bulk * 0.52,
          2,
        ),
        color: legColor,
        dye: legDye,
        rig: [leg, z, end * side, 0],
      })
    }
  const pivotY = spine + bulk * 0.2
  const pivotZ = half - bulk * 0.75
  const neck: [number, number, number, number] = [pivotY, pivotZ, 0, 1]
  const lean = Math.PI / 2 - build.neckLift
  const neckY = Math.cos(lean)
  const neckZ = Math.sin(lean)
  const headY = pivotY + neckY * build.neck
  const headZ = pivotZ + neckZ * build.neck
  const size = build.head
  parts.push({
    geometry: tube(
      [
        [pivotY - bulk * 0.25, pivotZ - bulk * 0.35, bulk * 0.62, bulk * 0.7],
        [
          pivotY + neckY * build.neck * 0.3,
          pivotZ + neckZ * build.neck * 0.3,
          bulk * 0.5,
          bulk * 0.6,
        ],
        [
          pivotY + neckY * build.neck * 0.75,
          pivotZ + neckZ * build.neck * 0.75,
          size * 0.62,
          size * 0.8,
        ],
        [headY + size * 0.12, headZ + size * 0.15, size * 0.6, size * 0.68],
      ],
      10,
      0,
      3,
    ),
    color: build.coat,
    dye: 1,
    rig: neck,
  })
  const faceDye = kind === 'sheep' ? 0 : 1
  parts.push({
    geometry: tube(
      [
        [headY + size * 0.2, headZ - size * 0.25, size * 0.5, size * 0.5],
        [headY + size * 0.05, headZ + size * 0.45, size * 0.56, size * 0.58],
        [headY - size * 0.45, headZ + size * 1.25, size * 0.42, size * 0.42],
        [headY - size * 0.82, headZ + size * 1.85, size * 0.36, size * 0.33],
        [headY - size * 0.95, headZ + size * 2.02, size * 0.2, size * 0.18],
      ],
      10,
      0,
      3,
    ),
    color: build.face,
    dye: faceDye,
    rig: neck,
  })
  if (build.trunk) {
    const tipY = headY - size * 0.9
    const tipZ = headZ + size * 1.95
    parts.push({
      geometry: tube(
        [
          [tipY + size * 0.25, tipZ - size * 0.2, size * 0.36, size * 0.36],
          [tipY - build.trunk * 0.35, tipZ + size * 0.12, size * 0.27, size * 0.27],
          [tipY - build.trunk * 0.75, tipZ + size * 0.05, size * 0.19, size * 0.19],
          [tipY - build.trunk, tipZ + size * 0.3, size * 0.13, size * 0.13],
        ],
        8,
        0,
        3,
      ),
      color: build.coat,
      dye: 1,
      rig: neck,
    })
    for (const side of [-1, 1]) {
      parts.push({
        geometry: new THREE.SphereGeometry(size * 1.05, 10, 8)
          .scale(0.1, 1.15, 0.85)
          .rotateY(side * 0.5)
          .translate(side * size * 0.7, headY - size * 0.1, headZ - size * 0.25),
        color: build.coat,
        dye: 2,
        rig: neck,
      })
      parts.push({
        geometry: new THREE.ConeGeometry(0.045, size * 1.3, 6)
          .rotateX(Math.PI * 0.62)
          .translate(side * size * 0.32, tipY + size * 0.1, tipZ + size * 0.25),
        color: '#e8e2d0',
        rig: neck,
      })
    }
  }
  for (const side of [-1, 1]) {
    if (build.trunk) continue
    parts.push({
      geometry: new THREE.ConeGeometry(size * 0.2, size * 0.7, 6)
        .scale(1, 1, 0.45)
        .rotateZ(-side * 1.15)
        .translate(side * size * 0.62, headY + size * 0.42, headZ + size * 0.1),
      color: build.face,
      dye: faceDye,
      rig: neck,
    })
    if (build.horns)
      parts.push({
        geometry: new THREE.ConeGeometry(0.024, build.horns, 5)
          .rotateZ(-side * 0.55)
          .rotateX(-0.3)
          .translate(
            side * size * 0.32,
            headY + size * 0.6 + build.horns * 0.4,
            headZ + size * 0.2,
          ),
        color: '#d9d2c2',
        rig: neck,
      })
  }
  parts.push({
    geometry: tube(
      [
        [spine + bulk * 0.3, -half + 0.02, 0.035, 0.035],
        [spine + bulk * 0.05, -half - 0.07, 0.024, 0.024],
        [spine + bulk * 0.3 - build.tail * 0.8, -half - 0.1, 0.02, 0.02],
        [spine + bulk * 0.3 - build.tail, -half - 0.09, 0.04, 0.04],
      ],
      5,
      0,
      2,
    ),
    color: build.coat,
    dye: kind === 'cow' || kind === 'horse' ? 2 : 1,
  })
  return assemble(parts, species.indexOf(kind) * 53 + 5)
}

export const coats: Record<Species, [coat: string, patch: string][]> = {
  cow: [
    ['#f1ece2', '#1f1c1a'],
    ['#f1ece2', '#6a3b22'],
    ['#7a4a2c', '#f1ece2'],
    ['#2a2522', '#2a2522'],
  ],
  sheep: [
    ['#eee8da', '#eee8da'],
    ['#ded6c4', '#ded6c4'],
  ],
  deer: [
    ['#9a6a42', '#9a6a42'],
    ['#84603f', '#84603f'],
  ],
  horse: [
    ['#5c3a24', '#2a1c14'],
    ['#8b5a34', '#3a2518'],
    ['#2b2420', '#2b2420'],
    ['#a67c52', '#2a1c14'],
  ],
  goat: [
    ['#e6dfd0', '#e6dfd0'],
    ['#6d5a48', '#6d5a48'],
    ['#b9a488', '#b9a488'],
  ],
  camel: [
    ['#c49a64', '#a9824f'],
    ['#b88d5a', '#9a7446'],
  ],
  elephant: [
    ['#7f7a74', '#6b6661'],
    ['#8a847c', '#726d66'],
  ],
}

export const outfits = {
  shirts: ['#c94f3d', '#2f6f8f', '#e0b23c', '#4e7d4a', '#e8e4da', '#7a4f8c', '#d9772e', '#3b4a5c'],
  trousers: ['#2e3640', '#4a4136', '#3f5063', '#5b5a52', '#26282b', '#6b5c48'],
  skin: ['#f0c8a8', '#d9a47c', '#b47c54', '#8a5a3a', '#5e3c28', '#e8b796'],
} as const
