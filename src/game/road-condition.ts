import { roadLayout } from './road'

export type RoadWear = 'fresh' | 'worn' | 'broken'
export const roadWears = ['fresh', 'worn', 'broken'] as const

export const roadConditionLayout = {
  period: 2400,
  rows: 4096,
  columns: 32,
  potholeDepth: 0.07,
  potholeEdge: 0.5,
  puddleLevel: { rain: 0.6, storm: 0.5 },
  puddleGrip: 0.78,
} as const

export interface RoadCondition {
  water: number
  dirt: number
  damage: number
  patch: number
}

function hash(column: number, row: number, salt: number) {
  let value = Math.imul(column, 374761393) ^ Math.imul(row, 668265263) ^ Math.imul(salt, 362437)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

function ease(value: number) {
  return value * value * (3 - 2 * value)
}

function loopNoise(across: number, along: number, cells: number, salt: number) {
  const column = Math.floor(across)
  const row = Math.floor(along)
  const blendAcross = ease(across - column)
  const blendAlong = ease(along - row)
  const at = (c: number, r: number) => hash(c, ((r % cells) + cells) % cells, salt)
  const near = at(column, row) * (1 - blendAcross) + at(column + 1, row) * blendAcross
  const far = at(column, row + 1) * (1 - blendAcross) + at(column + 1, row + 1) * blendAcross
  return near * (1 - blendAlong) + far * blendAlong
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function band(value: number, from: number, to: number) {
  return ease(clamp01((value - from) / (to - from)))
}

function paint() {
  const { period, rows, columns } = roadConditionLayout
  const width = roadLayout.halfWidth * 2
  const data = new Uint8Array(rows * columns * 4)
  const metres = period / rows
  const damage = new Float32Array(rows * columns)
  const patch = new Float32Array(rows * columns)
  const holes = Math.round(period / 55)
  for (let index = 0; index < holes; index++) {
    const along = (index + hash(index, 3, 11)) * (period / holes)
    const track = hash(index, 5, 11) > 0.5 ? 0.27 : 0.73
    const side = hash(index, 7, 11) > 0.5 ? 1 : -1
    const across = (0.5 + side * (track - 0.5) + (hash(index, 9, 11) - 0.5) * 0.16) * width
    const cluster = 1 + Math.floor(hash(index, 13, 11) * 3)
    for (let member = 0; member < cluster; member++) {
      const centreAlong = along + (hash(index, member, 17) - 0.5) * 3.2
      const centreAcross = across + (hash(index, member, 19) - 0.5) * 1.1
      const radiusAlong = 0.45 + hash(index, member, 23) * 0.55
      const radiusAcross = 0.32 + hash(index, member, 29) * 0.3
      const reach = Math.ceil((radiusAlong * 2.2) / metres)
      const centreRow = Math.round(centreAlong / metres)
      for (let step = -reach; step <= reach; step++) {
        const row = (((centreRow + step) % rows) + rows) % rows
        for (let column = 0; column < columns; column++) {
          const offsetAcross = ((column + 0.5) / columns) * width - centreAcross
          const offsetAlong = (centreRow + step + 0.5) * metres - centreAlong
          const reachOut = Math.hypot(offsetAcross / radiusAcross, offsetAlong / radiusAlong)
          const depth = clamp01(1.5 - reachOut)
          const cell = row * columns + column
          damage[cell] = Math.max(damage[cell] ?? 0, depth / 1.5)
        }
      }
    }
  }
  const repairs = Math.round(period / 90)
  for (let index = 0; index < repairs; index++) {
    const along = (index + hash(index, 31, 37)) * (period / repairs)
    const length = 4 + hash(index, 41, 37) * 22
    const lane = hash(index, 43, 37)
    const from = lane < 0.4 ? 0 : lane < 0.8 ? 0.5 : 0.1 + hash(index, 47, 37) * 0.3
    const to = lane < 0.4 ? 0.5 : lane < 0.8 ? 1 : from + 0.25 + hash(index, 53, 37) * 0.2
    const firstRow = Math.round(along / metres)
    const lastRow = Math.round((along + length) / metres)
    for (let step = firstRow; step <= lastRow; step++) {
      const row = ((step % rows) + rows) % rows
      const ends = Math.min(step - firstRow, lastRow - step) + 0.5
      for (let column = 0; column < columns; column++) {
        const across = (column + 0.5) / columns
        const sides = Math.min(across - from, to - across) * columns + 0.5
        const inside = clamp01(Math.min(ends, sides, 2) / 2)
        const cell = row * columns + column
        patch[cell] = Math.max(patch[cell] ?? 0, inside)
      }
    }
  }
  for (let row = 0; row < rows; row++) {
    const along = (row + 0.5) * metres
    for (let column = 0; column < columns; column++) {
      const across = (column + 0.5) / columns
      const lane = Math.abs(across - 0.5) * 2
      const rut = Math.max(0, 1 - Math.abs(lane - 0.46) / 0.2, band(lane, 0.78, 1) * 0.9)
      const basin =
        loopNoise(across * 3, along / 9, Math.round(period / 9), 61) * 0.62 +
        loopNoise(across * 6, along / 2.6, Math.round(period / 2.6), 67) * 0.26 +
        rut * 0.2
      const stretch = band(loopNoise(0, along / 140, Math.round(period / 140), 71), 0.3, 0.75)
      const cell = row * columns + column
      const hole = damage[cell] ?? 0
      const water = clamp01(basin * (0.72 + stretch * 0.4) + hole * 0.5)
      const drift = loopNoise(across * 4, along / 6, Math.round(period / 6), 73)
      const verge = loopNoise(across > 0.5 ? 1 : 0, along / 45, Math.round(period / 45), 89)
      const spill = band(lane, 0.7, 1) * band(verge, 0.35, 0.7)
      const crossing = band(loopNoise(0, along / 60, Math.round(period / 60), 79), 0.74, 0.86)
      const smear = loopNoise(across * 5, along / 1.7, Math.round(period / 1.7), 83)
      const dirt = clamp01(
        spill * (0.15 + drift * 1.05) + crossing * (0.35 + smear * 0.6) + hole * 0.35,
      )
      data[cell * 4] = Math.round(water * 255)
      data[cell * 4 + 1] = Math.round(dirt * 255)
      data[cell * 4 + 2] = Math.round(hole * 255)
      data[cell * 4 + 3] = Math.round((patch[cell] ?? 0) * 255)
    }
  }
  return data
}

let painted: Uint8Array | null = null

export function roadConditionData() {
  painted ??= paint()
  return painted
}

export function roadConditionAt(s: number, distance: number): RoadCondition {
  const { period, rows, columns } = roadConditionLayout
  const data = roadConditionData()
  const across = clamp01(distance / (roadLayout.halfWidth * 2) + 0.5) * columns - 0.5
  const along = (s / period) * rows - 0.5
  const column = Math.max(0, Math.min(columns - 2, Math.floor(across)))
  const row = Math.floor(along)
  const blendAcross = clamp01(across - column)
  const blendAlong = along - row
  const near = (((row % rows) + rows) % rows) * columns
  const far = ((((row + 1) % rows) + rows) % rows) * columns
  const channel = (offset: number) => {
    const a = data[(near + column) * 4 + offset] ?? 0
    const b = data[(near + column + 1) * 4 + offset] ?? 0
    const c = data[(far + column) * 4 + offset] ?? 0
    const d = data[(far + column + 1) * 4 + offset] ?? 0
    return (
      ((a * (1 - blendAcross) + b * blendAcross) * (1 - blendAlong) +
        (c * (1 - blendAcross) + d * blendAcross) * blendAlong) /
      255
    )
  }
  return { water: channel(0), dirt: channel(1), damage: channel(2), patch: channel(3) }
}

export function potholeDepth(wear: RoadWear, s: number, distance: number) {
  if (wear !== 'broken') return 0
  const { potholeDepth: depth, potholeEdge } = roadConditionLayout
  return band(roadConditionAt(s, distance).damage, potholeEdge - 0.14, potholeEdge + 0.2) * depth
}

export function puddleLevel(weather: string) {
  return weather === 'storm'
    ? roadConditionLayout.puddleLevel.storm
    : weather === 'rain'
      ? roadConditionLayout.puddleLevel.rain
      : 2
}

export function puddleDepth(weather: string, s: number, distance: number) {
  const level = puddleLevel(weather)
  if (level > 1) return 0
  return band(roadConditionAt(s, distance).water, level - 0.03, level + 0.05)
}
