export const canopyShade = { opacity: 0.34, spread: 0.62, lift: 0.07 }

export function canopyCover(pools: ArrayLike<number>, x: number, s: number) {
  let open = 1
  for (let index = 0; index + 2 < pools.length; index += 3) {
    const reach = (pools[index + 2] ?? 0) * canopyShade.spread
    if (reach <= 0) continue
    const away = Math.hypot(x - (pools[index] ?? 0), s - (pools[index + 1] ?? 0)) / reach
    if (away >= 1) continue
    const depth = (1 - away * away) ** 2
    open *= 1 - canopyShade.opacity * depth
  }
  return 1 - open
}

export const tuftShade = { depth: 1.5, cell: 8 }

export class CanopyIndex {
  private cells = new Map<string, number[]>()
  constructor(pools: ArrayLike<number>) {
    const { cell } = tuftShade
    for (let index = 0; index + 2 < pools.length; index += 3) {
      const x = pools[index] ?? 0
      const s = pools[index + 1] ?? 0
      const width = pools[index + 2] ?? 0
      const reach = width * canopyShade.spread
      if (reach <= 0) continue
      for (
        let column = Math.floor((x - reach) / cell);
        column <= Math.floor((x + reach) / cell);
        column++
      )
        for (
          let row = Math.floor((s - reach) / cell);
          row <= Math.floor((s + reach) / cell);
          row++
        ) {
          const key = `${column}/${row}`
          const list = this.cells.get(key)
          if (list) list.push(x, s, width)
          else this.cells.set(key, [x, s, width])
        }
    }
  }
  cover(x: number, s: number) {
    const { cell } = tuftShade
    const list = this.cells.get(`${Math.floor(x / cell)}/${Math.floor(s / cell)}`)
    return list ? canopyCover(list, x, s) : 0
  }
}

export function tuftLight(cover: number) {
  return Math.max(0.2, 1 - cover * tuftShade.depth)
}
