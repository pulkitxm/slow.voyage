import { type RoadSample, roadLayout } from './road'

export const groundLayout = { tileLength: 120, fullRows: 96, distantRows: 12 } as const

const sideOffsets = [
  roadLayout.halfWidth,
  roadLayout.halfWidth + roadLayout.verge,
  4,
  4.5,
  5,
  ...Array.from({ length: 38 }, (_, index) => 5.5 + index * 0.5),
  ...Array.from({ length: 37 }, (_, index) => 26 + index * 2),
  ...Array.from({ length: 39 }, (_, index) => 106 + index * 8),
  ...Array.from({ length: 16 }, (_, index) => 426 + index * 16),
  ...Array.from({ length: 29 }, (_, index) => 682 + index * 32),
  1600,
]
export const groundOffsets = Object.freeze([
  ...sideOffsets.map((offset) => -offset).reverse(),
  0,
  ...sideOffsets,
])

interface GroundField {
  road(s: number): RoadSample
  height(x: number, s: number): number
}

export function groundSurface(field: GroundField, x: number, s: number) {
  const step = groundLayout.tileLength / groundLayout.fullRows
  let start = Math.floor(s / step) * step
  let end = start + step
  if (s < Math.fround(start)) {
    end = start
    start -= step
  } else if (s > Math.fround(end)) {
    start = end
    end += step
  }
  const s0 = Math.fround(start)
  const s1 = Math.fround(end)
  const span = s1 - s0
  if (span <= 0 || s < s0 || s > s1) return null
  const road0 = field.road(start)
  const road1 = field.road(end)
  const v = (s - s0) / span
  const columnX = (column: number) => {
    const offset = groundOffsets[column] ?? 0
    return Math.fround(road0.x + offset) * (1 - v) + Math.fround(road1.x + offset) * v
  }
  let lower = 0
  let upper = groundOffsets.length - 1
  if (x < columnX(lower) || x > columnX(upper)) return null
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2)
    if (columnX(middle) > x) upper = middle
    else lower = middle
  }
  const left = groundOffsets[lower] ?? 0
  const right = groundOffsets[upper] ?? 0
  const x0L = Math.fround(road0.x + left)
  const x0R = Math.fround(road0.x + right)
  const x1L = Math.fround(road1.x + left)
  const x1R = Math.fround(road1.x + right)
  const hB = Math.fround(field.height(road0.x + right, start))
  const hC = Math.fround(field.height(road1.x + left, end))
  if (x <= x0R * (1 - v) + x1L * v) {
    const hA = Math.fround(field.height(road0.x + left, start))
    const b = (x - x0L * (1 - v) - x1L * v) / (x0R - x0L)
    const slopeX = (hB - hA) / (x0R - x0L)
    return {
      height: hA * (1 - b - v) + hB * b + hC * v,
      slopeX,
      slopeS: (hC - hA - slopeX * (x1L - x0L)) / span,
    }
  }
  const hD = Math.fround(field.height(road1.x + right, end))
  const d = (x - x0R * (1 - v) - x1L * v) / (x1R - x1L)
  const slopeX = (hD - hC) / (x1R - x1L)
  return {
    height: hB * (1 - v) + hC * (v - d) + hD * d,
    slopeX,
    slopeS: (hD - hB - slopeX * (x1R - x0R)) / span,
  }
}
