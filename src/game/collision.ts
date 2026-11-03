import type { BarrierContact } from './barrier'
import { guardrailAt, roadCoordinates, roadLayout } from './road'
import { clamp, type Vehicle, type World } from './world'

export interface Footprint {
  front: number
  rear: number
  halfWidth: number
}

export interface Trunk {
  x: number
  s: number
  radius: number
}

export type ObstacleMaterial = 'rail' | 'trunk' | 'edge' | 'water'

export interface Obstacle {
  material: ObstacleMaterial
  contacts: BarrierContact[]
  penetration: number
  normalX: number
  normalS: number
}

export const footprints: Record<Vehicle, Footprint> = {
  touring: { front: 2.12, rear: 2.01, halfWidth: 0.85 },
  roadster: { front: 2.12, rear: 2.03, halfWidth: 0.85 },
  motorcycle: { front: 1.44, rear: 1.28, halfWidth: 0.38 },
  bus: { front: 4.5, rear: 4.88, halfWidth: 1.18 },
}

export const railFaces = {
  inner: roadLayout.railOffset - 0.02,
  outer: roadLayout.railOffset + 0.12,
}
export const trunkSize = { base: 0.25, canopyShare: 0.02 }
const outlineSpacing = 1.5

export function trunkRadius(canopyWidth: number) {
  return trunkSize.base + canopyWidth * trunkSize.canopyShare
}

export function outline(footprint: Footprint) {
  const length = footprint.front + footprint.rear
  const segments = Math.max(1, Math.ceil(length / outlineSpacing))
  const points: { localX: number; localS: number }[] = []
  for (let index = 0; index <= segments; index++) {
    const localS = footprint.front - (index / segments) * length
    for (const side of [-1, 1]) points.push({ localX: side * footprint.halfWidth, localS })
  }
  return points
}

interface Pose {
  x: number
  s: number
  yaw: number
}

function toWorld(pose: Pose, localX: number, localS: number) {
  const cos = Math.cos(pose.yaw),
    sin = Math.sin(pose.yaw)
  return { x: pose.x + localX * cos - localS * sin, s: pose.s + localX * sin + localS * cos }
}

export function railObstacles(world: World, pose: Pose, footprint: Footprint) {
  const center = roadCoordinates(world, pose.x, pose.s).distance
  const obstacles: Obstacle[] = []
  for (const side of [-1, 1]) {
    const inside = center * side < railFaces.inner
    const outside = center * side > railFaces.outer
    if (!inside && !outside) continue
    let deepest: Obstacle | null = null
    const contacts: BarrierContact[] = []
    for (const point of outline(footprint)) {
      const position = toWorld(pose, point.localX, point.localS)
      const frame = roadCoordinates(world, position.x, position.s)
      const across = frame.distance * side
      const penetration = inside ? across - railFaces.inner : railFaces.outer - across
      if (penetration < 0 || !guardrailAt(world, frame.s, side)) continue
      const direction = inside ? side : -side
      const normalX = direction * Math.cos(frame.road.yaw),
        normalS = direction * Math.sin(frame.road.yaw)
      contacts.push({ localX: point.localX, localS: point.localS, normalX, normalS })
      if (!deepest || penetration > deepest.penetration)
        deepest = { material: 'rail', contacts, penetration, normalX, normalS }
    }
    if (deepest) obstacles.push(deepest)
  }
  return obstacles
}

export function trunkObstacle(pose: Pose, footprint: Footprint, trunk: Trunk): Obstacle | null {
  const cos = Math.cos(pose.yaw),
    sin = Math.sin(pose.yaw)
  const dx = trunk.x - pose.x,
    ds = trunk.s - pose.s
  const right = dx * cos + ds * sin
  const forward = -dx * sin + ds * cos
  const reach = Math.max(footprint.front, footprint.rear) + footprint.halfWidth + trunk.radius
  if (right * right + forward * forward > reach * reach) return null
  const nearestX = Math.max(-footprint.halfWidth, Math.min(footprint.halfWidth, right))
  const nearestS = Math.max(-footprint.rear, Math.min(footprint.front, forward))
  let normalRight = right - nearestX
  let normalForward = forward - nearestS
  let gap = Math.hypot(normalRight, normalForward)
  let contactX = nearestX,
    contactS = nearestS
  if (gap > 0) {
    if (gap >= trunk.radius) return null
    normalRight /= gap
    normalForward /= gap
  } else {
    const exits = [
      { depth: footprint.halfWidth - right, right: 1, forward: 0 },
      { depth: footprint.halfWidth + right, right: -1, forward: 0 },
      { depth: footprint.front - forward, right: 0, forward: 1 },
      { depth: footprint.rear + forward, right: 0, forward: -1 },
    ]
    const exit = exits.reduce((best, candidate) =>
      candidate.depth < best.depth ? candidate : best,
    )
    normalRight = exit.right
    normalForward = exit.forward
    contactX = exit.right ? exit.right * footprint.halfWidth : right
    contactS = exit.forward ? (exit.forward > 0 ? footprint.front : -footprint.rear) : forward
    gap = -exit.depth
  }
  const normalX = normalRight * cos - normalForward * sin
  const normalS = normalRight * sin + normalForward * cos
  return {
    material: 'trunk',
    contacts: [{ localX: contactX, localS: contactS, normalX, normalS }],
    penetration: trunk.radius - gap,
    normalX,
    normalS,
  }
}

export const terrainBounds = { waterLevel: 0, wadeDepth: 0.6, edge: 1500, step: 0.25 }

export function boundaryObstacle(world: World, pose: Pose, footprint: Footprint): Obstacle | null {
  const contacts: BarrierContact[] = []
  let deepest: Obstacle | null = null
  for (const point of outline(footprint)) {
    const position = toWorld(pose, point.localX, point.localS)
    const offset = position.x - world.road(position.s).x
    const outward = Math.sign(offset) || 1
    let penetration = Math.abs(offset) - terrainBounds.edge
    let normalX = outward
    let normalS = 0
    let material: ObstacleMaterial = 'edge'
    if (penetration <= 0) {
      material = 'water'
      const ground = world.surface(position.x, position.s)
      const depth = terrainBounds.waterLevel - terrainBounds.wadeDepth - ground.height
      if (ground.onRoad || depth <= 0) continue
      const gradient = Math.hypot(ground.slopeX, ground.slopeS)
      if (gradient > 1e-3) {
        normalX = -ground.slopeX / gradient
        normalS = -ground.slopeS / gradient
      }
      penetration = Math.min(depth / Math.max(gradient, 0.05), terrainBounds.step)
    }
    contacts.push({ localX: point.localX, localS: point.localS, normalX, normalS })
    if (!deepest || penetration > deepest.penetration)
      deepest = { material, contacts, penetration, normalX, normalS }
  }
  return deepest
}

export function wadingDrag(depth: number, speed: number) {
  const immersion = clamp(depth / terrainBounds.wadeDepth, 0, 1.5)
  return immersion * (0.4 * Math.abs(speed) + 0.12 * speed * speed)
}
