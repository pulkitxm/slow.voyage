export function latticeValue(x: number, s: number, seed: number) {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(s, 0x85ebca77)
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 2147483648 - 1
}

export function smoothStep(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

export function terrainField(x: number, s: number, seed: number) {
  let height = 0
  const scales = [1000, 250, 125]
  for (let layer = 0; layer < scales.length; layer++) {
    const scale = scales[layer] ?? 1000
    const u = x / scale - 0.5,
      v = s / scale - 0.5
    const column = Math.floor(u),
      row = Math.floor(v)
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const dx = u - column - i,
          ds = v - row - j
        const radiusSquared = dx * dx + ds * ds
        if (radiusSquared >= 1) continue
        const control = latticeValue(column + i, row + j, seed + layer * 977)
        const shaped = control * Math.abs(control) * (1 - Math.abs(control)) * 4
        height += shaped * (1 - smoothStep(radiusSquared)) * 160 * (scale / 1000)
      }
    }
  }
  return height
}

export function roadCurve(s: number, length: number, seed: number) {
  const coordinate = s / length
  const cell = Math.floor(coordinate)
  const t = coordinate - cell
  const start = latticeValue(cell, 0, seed),
    end = latticeValue(cell + 1, 0, seed)
  return {
    value: start + (end - start) * smoothStep(t),
    derivative: ((end - start) * 30 * t * t * (t - 1) * (t - 1)) / length,
  }
}
