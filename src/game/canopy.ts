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
