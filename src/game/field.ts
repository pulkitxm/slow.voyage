export function latticeValue(x: number, s: number, seed: number) {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(s, 0x85ebca77)
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 2147483648 - 1
}

export const worldLoop = { length: 12000, width: 3000 } as const

export function loopCells(spacing: number) {
  return Math.max(1, Math.round(worldLoop.length / spacing))
}

export function loopColumns(spacing: number) {
  return Math.max(1, Math.round(worldLoop.width / spacing))
}

export function wrapOffset(offset: number) {
  return offset - worldLoop.width * Math.round(offset / worldLoop.width)
}

export function loopIndex(index: number, cells: number) {
  return ((index % cells) + cells) % cells
}

export function centeredIndex(index: number, cells: number) {
  const half = Math.floor(cells / 2)
  return loopIndex(index + half, cells) - half
}

export function smoothStep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

export function terrainField(x: number, s: number, seed: number) {
  let height = 0
  for (let layer = 0; layer < terrainScales.length; layer++) {
    const scale = terrainScales[layer] ?? 1000
    const u = x / scale - 0.5,
      v = s / scale - 0.5
    const column = Math.floor(u),
      row = Math.floor(v),
      rows = loopCells(scale),
      columns = loopColumns(scale)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const dx = u - column - i,
          ds = v - row - j
        const radiusSquared = dx * dx + ds * ds
        if (radiusSquared >= 1) continue
        const control = latticeValue(
          centeredIndex(column + i, columns),
          loopIndex(row + j, rows),
          seed + layer * 977,
        )
        const shaped = control * Math.abs(control) * (1 - Math.abs(control)) * 4
        height += shaped * (1 - smoothStep(radiusSquared)) * 160 * (scale / 1000)
      }
    }
  }
  return height
}

export function roadCurve(s: number, length: number, seed: number) {
  const cells = loopCells(length)
  const span = worldLoop.length / cells
  const coordinate = s / span
  const cell = Math.floor(coordinate)
  const t = coordinate - cell
  const start = latticeValue(loopIndex(cell, cells), 0, seed),
    end = latticeValue(loopIndex(cell + 1, cells), 0, seed)
  return {
    value: start + (end - start) * smoothStep(t),
    derivative: ((end - start) * 30 * t * t * (t - 1) * (t - 1)) / span,
  }
}
const terrainScales = [1000, 250, 125] as const
