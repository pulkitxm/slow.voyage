import { worldLoop, wrapOffset } from './field'
import { groundSurface } from './ground-grid'
import { landscapeIds } from './landscapes'
import { guardrailAt, roadLayout, roadPoint } from './road'
import { lapWaterfalls, waterfallClearing } from './waterfalls'
import { angleDifference, random, shoreHeight, type World } from './world'

export interface Garage {
  id: number
  s: number
  side: 1 | -1
  floor: number
  yaw: number
}

export const garageLayout = {
  count: 4,
  roadEdge: roadLayout.halfWidth + roadLayout.shoulder,
  front: 11.5,
  back: 20,
  half: 9,
  bay: { u: -4.5, v: 15.8 },
  door: { from: -7.5, to: -1.5, height: 4.2 },
  apron: { u: 15, v: 3.6 },
  clearing: 24,
  approach: 34,
  pullIn: 9,
  rise: 1,
  dip: 1.8,
} as const

export interface GarageFrame {
  x: number
  s: number
  y: number
  yaw: number
  side: 1 | -1
}

export function garageFrame(world: World, garage: Garage, lap = 0): GarageFrame {
  const s = garage.s + lap
  const road = world.road(s)
  return { x: road.x, s, y: garage.floor, yaw: road.yaw, side: garage.side }
}

export function garagePoint(frame: GarageFrame, u: number, v: number) {
  const along = frame.s + u * Math.cos(frame.yaw)
  const across = frame.side * v
  return {
    x: frame.x + Math.cos(frame.yaw) * across - Math.sin(frame.yaw) * u,
    s: along + Math.sin(frame.yaw) * across,
  }
}

function siteHeights(world: World, s: number, side: 1 | -1) {
  const road = world.road(s)
  const frame = { x: road.x, s, y: road.y, yaw: road.yaw, side }
  let highest = Number.NEGATIVE_INFINITY
  let lowest = Number.POSITIVE_INFINITY
  for (const u of [-14, -9, -4.5, 0, 4.5, 9, 14])
    for (const v of [4, 7, 11, 14, 17, 20.5]) {
      const point = garagePoint(frame, u, v)
      const height =
        groundSurface(world, point.x, point.s)?.height ?? world.height(point.x, point.s)
      highest = Math.max(highest, height)
      lowest = Math.min(lowest, height)
    }
  return { road: road.y, highest, lowest }
}

let cached: { key: string; list: Garage[] } | null = null

export function lapGarages(world: World): Garage[] {
  const { landscape, seed, roadMode } = world.settings
  const key = `${landscape}/${roadMode}/${seed}`
  if (cached?.key === key) return cached.list
  const list: Garage[] = []
  const falls = lapWaterfalls(world)
  const { count } = garageLayout
  for (let slot = 0; slot < count; slot++) {
    const rng = random(seed * 6151 + slot * 92821 + landscapeIds.indexOf(landscape) * 17 + 3)
    let best: { garage: Garage; score: number } | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const s = ((slot + 0.2 + rng() * 0.6) * worldLoop.length) / count
      const side: 1 | -1 = rng() > 0.5 ? 1 : -1
      const turn = Math.abs(angleDifference(world.road(s + 25).yaw, world.road(s - 25).yaw))
      if (turn > 0.16) continue
      let railed = false
      for (let along = -30; along <= 30; along += 5)
        if (guardrailAt(world, s + along, side)) railed = true
      if (railed) continue
      const heights = siteHeights(world, s, side)
      if (heights.lowest < shoreHeight + 0.6) continue
      const rise = heights.highest - heights.road
      const dip = heights.road - heights.lowest
      if (rise > garageLayout.rise || dip > garageLayout.dip) continue
      const centre = roadPoint(world.road(s), s, side * 15)
      if (waterfallClearing(falls, 0, centre.x, centre.s)) continue
      const score = turn * 20 + rise + dip * 0.5
      if (!best || score < best.score)
        best = {
          garage: {
            id: slot,
            s,
            side,
            floor: Math.max(heights.road, heights.highest) + 0.06,
            yaw: world.road(s).yaw,
          },
          score,
        }
      if (score < 0.4) break
    }
    if (best) list.push(best.garage)
  }
  cached = { key, list }
  return list
}

export function garageOffset(garage: Garage, s: number) {
  const along = garage.s - s
  return along - worldLoop.length * Math.round(along / worldLoop.length)
}

export function nearestGarage(world: World, x: number, s: number) {
  let found: { garage: Garage; along: number; across: number } | null = null
  for (const garage of lapGarages(world)) {
    const along = garageOffset(garage, s)
    const road = world.road(s)
    const across = wrapOffset(x - road.x) * garage.side
    if (!found || Math.abs(along) < Math.abs(found.along)) found = { garage, along, across }
  }
  return found
}

export function garageClearing(world: World, x: number, s: number) {
  for (const garage of lapGarages(world)) {
    if (Math.abs(garageOffset(garage, s)) > garageLayout.clearing) continue
    const road = world.road(s)
    const across = wrapOffset(x - road.x) * garage.side
    if (across > garageLayout.roadEdge - 0.4 && across < garageLayout.back + 4) return true
  }
  return false
}
