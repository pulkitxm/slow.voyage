import * as THREE from 'three'
import type { Trunk } from './collision'
import {
  animalGeometry,
  type Creature,
  coats,
  creatureRadius,
  outfits,
  personGeometry,
  type Species,
  species,
} from './creatures'
import { loopCells, loopIndex } from './field'
import { type Landscape, landscapeIds } from './landscapes'
import { roadPoint } from './road'
import { type LifeLevel, random, type Settings, shoreHeight, type World } from './world'

export const lifeLayout = {
  slot: 60,
  behind: 150,
  ahead: 420,
  capacity: 40,
  verge: 4.5,
  stride: 44,
  aside: 14,
  walkers: { quiet: 0.1, lively: 0.24 },
  herds: { quiet: 0.14, lively: 0.3 },
} as const

const herds: Record<Landscape, readonly Species[]> = {
  highlands: ['cow', 'sheep', 'horse', 'cow'],
  alpine: ['goat', 'cow', 'deer'],
  desert: ['camel', 'goat', 'camel'],
  forest: ['deer', 'deer', 'horse'],
  canyon: ['horse', 'goat'],
  fjord: ['sheep', 'deer', 'cow'],
  jungle: ['elephant', 'deer', 'elephant', 'goat'],
}

const herdSize: Record<Species, [fewest: number, most: number]> = {
  cow: [4, 8],
  sheep: [5, 10],
  deer: [2, 4],
  horse: [2, 5],
  goat: [3, 6],
  camel: [2, 4],
  elephant: [2, 4],
}

interface Member {
  kind: Creature
  along: number
  across: number
  pace: number
  phase: number
  heading: number
  scale: number
  roam: number
  grazer: number
  tints: [THREE.Color, THREE.Color, THREE.Color]
}

interface Plan {
  base: number
  side: number
  walkers: boolean
  members: Member[]
}

export interface Placed {
  kind: Creature
  x: number
  y: number
  s: number
  yaw: number
  step: number
  stride: number
  graze: number
  member: Member
}

function hashed(index: number, salt: number) {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 7, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

function ease(value: number) {
  const bounded = Math.max(0, Math.min(1, value))
  return bounded * bounded * (3 - 2 * bounded)
}

export function planSlot(world: World, slot: number, level: LifeLevel): Plan | null {
  if (level === 'none') return null
  const { landscape, seed, season } = world.settings
  const base = slot * lifeLayout.slot
  const rng = random(seed * 31 + slot * 7919 + landscapeIds.indexOf(landscape) * 131 + 17)
  const roll = rng()
  const firstSide = rng() > 0.5 ? 1 : -1
  const walkers = lifeLayout.walkers[level]
  const grazing = lifeLayout.herds[level] * (season === 'winter' ? 0.5 : 1)
  if (roll < walkers) {
    for (const side of [firstSide, -firstSide]) {
      let flat = true
      for (let step = 0; step <= 6 && flat; step++) {
        const s = base + 6 + (step * (lifeLayout.slot - 12)) / 6
        const road = world.road(s)
        for (const reach of [lifeLayout.verge, lifeLayout.verge + 2.2]) {
          const point = roadPoint(road, s, side * reach)
          const ground = world.height(point.x, point.s)
          if (Math.abs(ground - road.y) > 0.55 || ground < shoreHeight + 0.4) flat = false
        }
        if (world.guardrail(s, side)) flat = false
      }
      if (!flat) continue
      const count = 1 + Math.floor(rng() * 2.6)
      const heading = rng() > 0.5 ? 1 : -1
      const pace = 1.15 + rng() * 0.35
      const phase = rng() * 200
      const members: Member[] = []
      for (let index = 0; index < count; index++) {
        const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)] as T
        members.push({
          kind: 'person',
          along: index * (0.2 + rng() * 0.5),
          across: lifeLayout.verge + index * 0.72,
          pace,
          phase,
          heading,
          scale: 0.92 + rng() * 0.14,
          roam: 0,
          grazer: 0,
          tints: [
            new THREE.Color(pick(outfits.shirts)),
            new THREE.Color(pick(outfits.trousers)),
            new THREE.Color(pick(outfits.skin)),
          ],
        })
      }
      return { base, side, walkers: true, members }
    }
    return null
  }
  if (roll < walkers + grazing) {
    const pool = herds[landscape]
    const kind = pool[Math.floor(rng() * pool.length)] ?? 'cow'
    for (const side of [firstSide, -firstSide]) {
      const across = 13 + rng() * 34
      const centre = base + lifeLayout.slot / 2
      const road = world.road(centre)
      const home = roadPoint(road, centre, side * across)
      let open = true
      for (const [dx, ds] of [
        [0, 0],
        [9, 0],
        [-9, 0],
        [0, 9],
        [0, -9],
      ] as const) {
        const here = world.height(home.x + dx, home.s + ds)
        const slope =
          Math.hypot(
            world.height(home.x + dx + 1, home.s + ds) - here,
            world.height(home.x + dx, home.s + ds + 1) - here,
          ) / 1
        if (here < shoreHeight + 0.7 || slope > 0.3) open = false
      }
      const snow = world.settings.landscape === 'alpine' && world.height(home.x, home.s) > 150
      if (!open || snow) continue
      const [fewest, most] = herdSize[kind]
      const count = fewest + Math.floor(rng() * (most - fewest + 1))
      const palette = coats[kind]
      const members: Member[] = []
      for (let index = 0; index < count; index++) {
        const angle = rng() * Math.PI * 2
        const spread = 2 + Math.sqrt(rng()) * 8
        const [coat, patch] = palette[Math.floor(rng() * palette.length)] ?? ['#ffffff', '#ffffff']
        members.push({
          kind,
          along: lifeLayout.slot / 2 + Math.sin(angle) * spread,
          across: across + Math.cos(angle) * spread * side,
          pace: 0.5 + rng() * 0.4,
          phase: rng() * 100,
          heading: rng() * Math.PI * 2,
          scale: 0.88 + rng() * 0.22,
          roam: 1.5 + rng() * 2.5,
          grazer: kind === 'elephant' ? 0.12 : rng() < 0.78 ? 1 : 0.15,
          tints: [new THREE.Color(coat), new THREE.Color(patch), new THREE.Color(coat)],
        })
      }
      return { base, side, walkers: false, members }
    }
  }
  return null
}

export function placeMember(
  world: World,
  plan: Plan,
  member: Member,
  lap: number,
  time: number,
  car: { x: number; s: number },
): Placed {
  if (member.kind === 'person') {
    const span = lifeLayout.stride
    const travelled = time * member.pace + member.phase
    const lapse = travelled % (span * 2)
    const forward = lapse < span
    const local = 8 + (forward ? lapse : span * 2 - lapse) + member.along * (forward ? -1 : 1)
    const s = plan.base + lap + local
    const road = world.road(s)
    const centre = roadPoint(road, s, plan.side * member.across)
    const near = Math.hypot(centre.x - car.x, centre.s - car.s)
    const aside = ease(1 - near / lifeLayout.aside) * 1.3
    const point = roadPoint(road, s, plan.side * (member.across + aside))
    const direction = forward ? 1 : -1
    return {
      kind: 'person',
      x: point.x,
      y: world.surface(point.x, point.s).height,
      s: point.s,
      yaw: Math.atan2(-Math.sin(road.yaw) * direction, -Math.cos(road.yaw) * direction),
      step: travelled * 2.6,
      stride: 0.62,
      graze: 0,
      member,
    }
  }
  const s = plan.base + lap + member.along
  const road = world.road(s)
  const home = roadPoint(road, s, plan.side * member.across)
  const period = 13 + (member.phase % 9)
  const clock = time / period + member.phase
  const cycle = Math.floor(clock)
  const part = clock - cycle
  const spot = (index: number) => {
    const angle = hashed(index, Math.floor(member.phase * 97)) * Math.PI * 2
    const reach = hashed(index, Math.floor(member.phase * 31) + 3) * member.roam
    return [Math.cos(angle) * reach, Math.sin(angle) * reach] as const
  }
  const [fromX, fromS] = spot(cycle - 1)
  const [toX, toS] = spot(cycle)
  const walked = ease(part / 0.3)
  const moving = part < 0.3
  const x = home.x + fromX + (toX - fromX) * walked
  const along = home.s + fromS + (toS - fromS) * walked
  const distance = Math.hypot(toX - fromX, toS - fromS)
  return {
    kind: member.kind,
    x,
    y: world.surface(x, along).height,
    s: along,
    yaw: Math.atan2(toX - fromX, -(toS - fromS)),
    step: (cycle * 7 + walked * distance * 3.2) * 1.6,
    stride: moving ? 0.42 * Math.sin(Math.PI * Math.min(1, part / 0.3)) : 0,
    graze: member.grazer * ease((part - 0.36) / 0.12) * (1 - ease((part - 0.86) / 0.1)),
    member,
  }
}

const poseVertex = `
attribute vec4 rig;
attribute vec2 knee;
attribute float dye;
attribute vec4 gait;
attribute vec3 tintA;
attribute vec3 tintB;
attribute vec3 tintC;
vec3 lifeTurn(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}
vec3 lifePose(vec3 v, float place) {
  float fold = max(0.0, cos(gait.x) * rig.z) * gait.y * 1.25 * knee.y;
  vec3 kneeAt = vec3(0.0, knee.x, rig.y) * place;
  v = lifeTurn(v - kneeAt, fold) + kneeAt;
  vec3 pivot = vec3(0.0, rig.x, rig.y) * place;
  return lifeTurn(v - pivot, -sin(gait.x) * gait.y * rig.z + gait.z * rig.w) + pivot;
}
`

function lifeMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${poseVertex}`)
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vColor.rgb *= dye < 0.5 ? vec3(1.0) : dye < 1.5 ? tintA : dye < 2.5 ? tintB : tintC;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = lifePose(objectNormal, 0.0);',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed = lifePose(transformed, 1.0);',
      )
  }
  material.customProgramCacheKey = () => 'roadside-life'
  return material
}

class Troupe {
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  gait: THREE.InstancedBufferAttribute
  tints: THREE.InstancedBufferAttribute[]
  constructor(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial) {
    const capacity = lifeLayout.capacity
    this.gait = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    this.gait.setUsage(THREE.DynamicDrawUsage)
    this.tints = ['tintA', 'tintB', 'tintC'].map((name) => {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
      attribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, attribute)
      return attribute
    })
    geometry.setAttribute('gait', this.gait)
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }
}

export class Life {
  group = new THREE.Group()
  placed: Placed[] = []
  private material = lifeMaterial()
  private troupes = new Map<Creature, Troupe>()
  private plans = new Map<number, Plan | null>()
  private key = ''
  private pose = new THREE.Object3D()
  constructor(private world: World) {
    for (const kind of ['person', ...species] as const)
      this.troupes.set(
        kind,
        new Troupe(kind === 'person' ? personGeometry() : animalGeometry(kind), this.material),
      )
    for (const troupe of this.troupes.values()) this.group.add(troupe.mesh)
  }
  update(
    settings: Settings,
    car: { x: number; s: number },
    time: number,
    daytime: boolean,
    calm: boolean,
  ) {
    const key = `${settings.landscape}/${settings.seed}/${settings.season}/${settings.life}`
    if (key !== this.key) {
      this.key = key
      this.plans.clear()
    }
    this.placed.length = 0
    const counts = new Map<Creature, number>()
    if (settings.life !== 'none') {
      const cells = loopCells(lifeLayout.slot)
      const first = Math.floor((car.s - lifeLayout.behind) / lifeLayout.slot)
      const last = Math.floor((car.s + lifeLayout.ahead) / lifeLayout.slot)
      for (let slot = first; slot <= last; slot++) {
        const wrapped = loopIndex(slot, cells)
        let plan = this.plans.get(wrapped)
        if (plan === undefined) {
          plan = planSlot(this.world, wrapped, settings.life)
          this.plans.set(wrapped, plan)
        }
        if (!plan || (plan.walkers && !(daytime && calm))) continue
        const lap = (slot - wrapped) * lifeLayout.slot
        for (const member of plan.members) {
          const troupe = this.troupes.get(member.kind)
          const index = counts.get(member.kind) ?? 0
          if (!troupe || index >= lifeLayout.capacity) continue
          const spot = placeMember(this.world, plan, member, lap, time, car)
          counts.set(member.kind, index + 1)
          this.placed.push(spot)
          this.pose.position.set(spot.x, spot.y, -spot.s)
          this.pose.rotation.set(0, spot.yaw, 0)
          this.pose.scale.setScalar(member.scale)
          this.pose.updateMatrix()
          troupe.mesh.setMatrixAt(index, this.pose.matrix)
          troupe.gait.setXYZW(index, spot.step, spot.stride, spot.graze * 0.95, 0)
          for (const [slotIndex, tint] of member.tints.entries())
            troupe.tints[slotIndex]?.setXYZ(index, tint.r, tint.g, tint.b)
        }
      }
    }
    for (const [kind, troupe] of this.troupes) {
      troupe.mesh.count = counts.get(kind) ?? 0
      if (!troupe.mesh.count) continue
      troupe.mesh.instanceMatrix.needsUpdate = true
      troupe.gait.needsUpdate = true
      for (const tint of troupe.tints) tint.needsUpdate = true
    }
  }
  *obstacles(s: number): Generator<Trunk> {
    for (const spot of this.placed)
      if (Math.abs(spot.s - s) < 12)
        yield { x: spot.x, s: spot.s, radius: creatureRadius[spot.kind] * spot.member.scale }
  }
  dispose() {
    this.group.removeFromParent()
    for (const troupe of this.troupes.values()) {
      troupe.mesh.geometry.dispose()
      troupe.mesh.dispose()
    }
    this.material.dispose()
  }
}
