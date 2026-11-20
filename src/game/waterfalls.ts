import * as THREE from 'three'
import { worldLoop } from './field'
import { landscapeIds, landscapeProfiles } from './landscapes'
import { roadCoordinates, roadLayout, roadPoint } from './road'
import { random, shoreHeight, type World } from './world'

export const waterfallLayout = {
  nearest: 30,
  farthest: 95,
  step: 2,
  longest: 90,
  drop: 12,
  steepness: 0.4,
  apart: 260,
  width: 3.6,
  lift: 0.3,
  shelf: 20,
  tallest: 22,
  lowest: 7,
} as const

export interface Waterfall {
  id: number
  s: number
  width: number
  height: number
  span: number
  foot: { x: number; y: number; s: number }
  facing: { x: number; s: number }
  path: { x: number; y: number; s: number; steep: number }[]
}

let cached: { key: string; list: Waterfall[] } | null = null

function slopeAt(world: World, x: number, s: number) {
  const reach = 1.5
  return {
    x: (world.height(x + reach, s) - world.height(x - reach, s)) / (reach * 2),
    s: (world.height(x, s + reach) - world.height(x, s - reach)) / (reach * 2),
  }
}

function trace(world: World, x: number, s: number) {
  const { step, longest } = waterfallLayout
  let headX = x
  let headS = s
  for (let climb = 0; climb < 24; climb++) {
    const slope = slopeAt(world, headX, headS)
    const grade = Math.hypot(slope.x, slope.s)
    if (grade < 0.3) break
    headX += (slope.x / grade) * 3
    headS += (slope.s / grade) * 3
  }
  const path: Waterfall['path'] = []
  let gentle = 0
  for (let index = 0; index < longest / step; index++) {
    const y = world.height(headX, headS)
    const slope = slopeAt(world, headX, headS)
    const grade = Math.hypot(slope.x, slope.s)
    const offset = Math.abs(roadCoordinates(world, headX, headS).distance)
    if (y < shoreHeight + 0.2 || offset < roadLayout.halfWidth + 10) break
    path.push({ x: headX, y, s: headS, steep: grade })
    gentle = grade < 0.16 ? gentle + 1 : 0
    if (gentle > 3 || grade < 0.02) break
    const run = step / Math.sqrt(1 + grade * grade)
    headX -= (slope.x / grade) * run
    headS -= (slope.s / grade) * run
  }
  return path
}

export function lapWaterfalls(world: World): Waterfall[] {
  const { landscape, seed } = world.settings
  const key = `${landscape}/${seed}`
  if (cached?.key === key) return cached.list
  const list: Waterfall[] = []
  const wanted = landscapeProfiles[landscape].falls
  const rng = random(seed * 4253 + landscapeIds.indexOf(landscape) * 977 + 29)
  const { nearest, farthest, drop, steepness, apart, width, shelf, tallest, lowest } =
    waterfallLayout
  for (let attempt = 0; attempt < wanted * 60 && list.length < wanted; attempt++) {
    const s = rng() * worldLoop.length
    const side = rng() > 0.5 ? 1 : -1
    const reach = nearest + rng() * (farthest - nearest)
    const size = width * (0.8 + rng() * 0.7)
    const span = 19 + rng() * 10
    if (
      list.some((fall) => {
        const gap = Math.abs(fall.s - s)
        return Math.min(gap, worldLoop.length - gap) < apart
      })
    )
      continue
    const start = roadPoint(world.road(s), s, side * reach)
    const path = trace(world, start.x, start.s)
    const first = path[0]
    const last = path[path.length - 1]
    if (!first || !last || path.length < 12) continue
    const fallen = first.y - last.y
    const run = (path.length - 1) * waterfallLayout.step
    if (fallen < drop || fallen / run < steepness) continue
    let lip = 4
    for (let index = 4; index < path.length - 5; index++)
      if ((path[index]?.steep ?? 0) > (path[lip]?.steep ?? 0)) lip = index
    const foot = path[Math.min(path.length - 1, lip + 3)]
    const above = path[Math.max(0, lip - 2)]
    if (!foot || !above) continue
    const alongX = foot.x - above.x
    const alongS = foot.s - above.s
    const length = Math.hypot(alongX, alongS)
    if (length < 1) continue
    const facing = { x: alongX / length, s: alongS / length }
    const height = world.height(foot.x - facing.x * shelf, foot.s - facing.s * shelf) - foot.y
    if (height < lowest) continue
    const seen = roadCoordinates(world, foot.x, foot.s)
    const source = roadCoordinates(world, first.x, first.s)
    if (Math.abs(seen.distance) > Math.abs(source.distance) - 6) continue
    const toward =
      -Math.sign(seen.distance) *
      (facing.x * Math.cos(seen.road.yaw) + facing.s * Math.sin(seen.road.yaw))
    if (toward < 0.72) continue
    if (seen.road.y > foot.y + 9) continue
    if (Math.abs(seen.distance) < 24) continue
    list.push({
      id: list.length,
      s: foot.s,
      width: size,
      height: Math.min(tallest, height),
      span,
      foot: { x: foot.x, y: foot.y, s: foot.s },
      facing,
      path: path.slice(Math.min(path.length - 2, lip + 3)),
    })
  }
  cached = { key, list }
  return list
}

function wobble(a: number, b: number, salt: number) {
  const value = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453
  return value - Math.floor(value)
}

export function cragGeometry(world: World, fall: Waterfall, lap: number, tone: string) {
  const { foot, facing, height, span } = fall
  const sideX = -facing.s
  const sideS = facing.x
  const columns = 22
  const rows = 7
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const rock = new THREE.Color(tone)
  const moss = new THREE.Color('#5f7a3e')
  const shade = new THREE.Color()
  const rim: number[] = []
  const place = (across: number, depth: number, y: number, tint: THREE.Color) => {
    positions.push(
      foot.x + sideX * across - facing.x * depth,
      y,
      -(foot.s + lap + sideS * across - facing.s * depth),
    )
    colors.push(tint.r, tint.g, tint.b)
    return positions.length / 3 - 1
  }
  for (let column = 0; column <= columns; column++) {
    const angle = (column / columns) * Math.PI
    const across = (span / 2) * Math.cos(angle)
    const round = Math.sin(angle) ** 0.55
    const depth = waterfallLayout.shelf * (1 - round)
    const ground = world.height(
      foot.x + sideX * across - facing.x * depth,
      foot.s + sideS * across - facing.s * depth,
    )
    const notch = Math.abs(across) < fall.width * 0.6 ? 0.7 : 0
    const top = foot.y + height * (0.94 + wobble(column, fall.id, 1) * 0.08) - notch
    const base = Math.min(ground, foot.y) - 2
    for (let row = 0; row <= rows; row++) {
      const lift = row / rows
      const y = base + (top - base) * lift
      const bulge =
        (wobble(column, row, fall.id + 3) - 0.5) * 1.7 * Math.sin(lift * Math.PI) + lift * -1.1
      const outX = Math.cos(angle) * 0.6
      const band = 0.72 + wobble(row, fall.id, 5) * 0.34 + (wobble(column, row, 9) - 0.5) * 0.16
      shade.copy(rock).multiplyScalar(band)
      if (row === rows) shade.lerp(moss, 0.45)
      const index = place(across + outX * bulge, depth - round * bulge, y, shade)
      if (row === rows) rim.push(index)
      if (column < columns && row < rows) {
        const a = column * (rows + 1) + row
        const b = a + rows + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  shade.copy(rock).lerp(moss, 0.6)
  const crown = place(0, waterfallLayout.shelf * 0.62, foot.y + height * 1.02, shade)
  for (let column = 0; column < columns; column++) {
    const a = rim[column]
    const b = rim[column + 1]
    if (a !== undefined && b !== undefined) indices.push(a, crown, b)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  const flat = geometry.toNonIndexed()
  geometry.dispose()
  flat.computeVertexNormals()
  return flat
}

export function waterfallClearing(falls: Waterfall[], lap: number, x: number, s: number) {
  for (const fall of falls) {
    const dx = x - fall.foot.x
    const ds = s - fall.foot.s - lap
    if (Math.abs(dx) > 130 || Math.abs(ds) > 130) continue
    const ahead = dx * fall.facing.x + ds * fall.facing.s
    const aside = Math.abs(-dx * fall.facing.s + ds * fall.facing.x)
    if (
      ahead > -waterfallLayout.shelf - 3 &&
      ahead < 110 &&
      aside < fall.span * 0.62 + Math.max(0, ahead) * 0.3
    )
      return true
  }
  return false
}

export function cragFootprint(fall: Waterfall, lap: number) {
  const { foot, facing, span } = fall
  return [-0.36, -0.12, 0.12, 0.36].map((share) => ({
    x: foot.x - facing.s * span * share - facing.x * 3.4,
    s: foot.s + lap + facing.x * span * share - facing.s * 3.4,
    radius: span * 0.16,
  }))
}

export function waterfallGeometry(world: World, fall: Waterfall, lap: number) {
  const positions: number[] = []
  const uvs: number[] = []
  const flow: number[] = []
  const indices: number[] = []
  const across = 5
  const { path, foot, facing, height } = fall
  const sideX = -facing.s
  const sideS = facing.x
  const sheet = 9
  for (const layer of [0, 1]) {
    const first = positions.length / 3
    for (let row = 0; row <= sheet; row++) {
      const fallen = row / sheet
      const forward = 1.5 + layer * 0.45 + fallen * fallen * (1.6 + layer * 0.9)
      const y = foot.y + height * 0.88 - fallen * (height * 0.88 + 0.3)
      const spread = fall.width * (0.8 + fallen * 0.5) * (1 - layer * 0.35)
      const drift = layer * fall.width * 0.12
      for (let column = 0; column < across; column++) {
        const u = column / (across - 1)
        positions.push(
          foot.x + sideX * ((u - 0.5) * spread + drift) + facing.x * forward,
          y,
          -(foot.s + lap + sideS * ((u - 0.5) * spread + drift) + facing.s * forward),
        )
        uvs.push(u, fallen * height * (0.9 + layer * 0.35) + layer * 17)
        flow.push(1, Math.min(1, row / 1.2), 0)
      }
      if (row < sheet)
        for (let column = 0; column < across - 1; column++) {
          const a = first + row * across + column
          indices.push(a, a + across, a + 1, a + 1, a + across, a + across + 1)
        }
    }
  }
  const pool = positions.length / 3
  const ring = 14
  const centreX = foot.x + facing.x * 3.4
  const centreS = foot.s + facing.s * 3.4
  positions.push(centreX, world.height(centreX, centreS) + waterfallLayout.lift, -(centreS + lap))
  uvs.push(0.5, 0.5)
  flow.push(1, 1, 2)
  for (let index = 0; index < ring; index++) {
    const angle = (index / ring) * Math.PI * 2
    const reach = fall.width * 1.9
    const x = centreX + Math.cos(angle) * reach
    const s = centreS + Math.sin(angle) * reach
    positions.push(x, world.height(x, s) + waterfallLayout.lift, -(s + lap))
    uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5)
    flow.push(0, 1, 2)
    indices.push(pool, pool + 1 + index, pool + 1 + ((index + 1) % ring))
  }
  const stream = positions.length / 3
  let travelled = 0
  for (const [index, point] of path.entries()) {
    const before = path[Math.max(0, index - 1)] ?? point
    const after = path[Math.min(path.length - 1, index + 1)] ?? point
    const alongX = after.x - before.x
    const alongS = after.s - before.s
    const length = Math.hypot(alongX, alongS) || 1
    if (index) travelled += Math.hypot(point.x - before.x, point.y - before.y, point.s - before.s)
    const spread = fall.width * (1 + 0.25 * Math.sin(index * 1.7 + fall.id))
    const ends = Math.min(1, (path.length - 1 - index) / 3)
    for (let column = 0; column < across; column++) {
      const u = column / (across - 1)
      const x = point.x - (alongS / length) * (u - 0.5) * spread
      const s = point.s + (alongX / length) * (u - 0.5) * spread
      positions.push(x, world.height(x, s) + waterfallLayout.lift, -(s + lap))
      uvs.push(u, travelled)
      flow.push(Math.min(1, point.steep * 0.8), ends, 0)
    }
    if (index < path.length - 1)
      for (let column = 0; column < across - 1; column++) {
        const a = stream + index * across + column
        indices.push(a, a + across, a + 1, a + 1, a + across, a + across + 1)
      }
  }
  const base = positions.length / 3
  const size = Math.min(8, Math.max(fall.width * 2, height * 0.5))
  for (let blade = 0; blade < 3; blade++) {
    const angle = (blade / 3) * Math.PI + fall.id
    const dx = Math.cos(angle) * size
    const ds = Math.sin(angle) * size
    const corner = base + blade * 4
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      positions.push(
        centreX + (u - 0.5) * dx,
        foot.y - 0.6 + v * size * 0.9,
        -(centreS + lap + (u - 0.5) * ds),
      )
      uvs.push(u, v)
      flow.push(0, 1, 1)
    }
    indices.push(corner, corner + 1, corner + 2, corner + 1, corner + 3, corner + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('fallFlow', new THREE.Float32BufferAttribute(flow, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function waterfallMaterial(noise: THREE.IUniform, time: THREE.IUniform) {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.35,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fieldNoiseMap = noise
    shader.uniforms.fallTime = time
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 fallFlow;\nvarying vec2 fallUv;\nvarying vec3 fallShape;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfallUv = uv;\nfallShape = fallFlow;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D fieldNoiseMap;\nuniform float fallTime;\nvarying vec2 fallUv;\nvarying vec3 fallShape;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (fallShape.z > 1.5) {
  float ringed = length(fallUv - 0.5) * 2.0;
  float churn = texture2D(fieldNoiseMap, fallUv * 0.22 + vec2(fallTime * 0.012, -fallTime * 0.009)).r;
  float froth = smoothstep(0.75, 0.15, ringed + (churn - 0.5) * 0.5);
  diffuseColor.rgb = mix(vec3(0.36, 0.56, 0.62), vec3(1.0), froth);
  diffuseColor.a = (1.0 - smoothstep(0.7, 1.0, ringed + (churn - 0.5) * 0.3)) * mix(0.62, 0.95, froth);
} else if (fallShape.z > 0.5) {
  float puff = texture2D(fieldNoiseMap, vec2(fallUv.x * 0.09 + fallTime * 0.004, fallUv.y * 0.07 - fallTime * 0.022)).r;
  float haze = texture2D(fieldNoiseMap, vec2(fallUv.x * 0.21 - fallTime * 0.006, fallUv.y * 0.16 - fallTime * 0.04)).r;
  vec2 centred = (fallUv - vec2(0.5, 0.32)) * vec2(2.0, 1.5);
  float body = 1.0 - smoothstep(0.15, 1.0, length(centred));
  diffuseColor.rgb = vec3(0.96, 0.98, 1.0);
  diffuseColor.a = body * smoothstep(0.25, 0.8, puff * 0.6 + haze * 0.5) * 0.42;
} else {
  float streak = texture2D(fieldNoiseMap, vec2(fallUv.x * 0.1 + 0.31, fallUv.y * 0.0045 - fallTime * 0.03)).r * 0.6
    + texture2D(fieldNoiseMap, vec2(fallUv.x * 0.27 + 0.7, fallUv.y * 0.012 - fallTime * 0.075)).r * 0.4;
  float rim = texture2D(fieldNoiseMap, vec2(fallUv.y * 0.02, fallUv.x * 0.1)).r;
  float sides = smoothstep(0.0, 0.16 + rim * 0.2, fallUv.x) * smoothstep(1.0, 0.84 - rim * 0.2, fallUv.x);
  float foam = smoothstep(0.34, 0.66, streak + fallShape.x * 0.22);
  diffuseColor.rgb = mix(vec3(0.42, 0.6, 0.66), vec3(1.0), foam);
  diffuseColor.a = sides * fallShape.y * mix(0.5, 0.96, foam);
}`,
      )
  }
  material.customProgramCacheKey = () => 'cascading-water'
  return material
}
