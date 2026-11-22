import type { Footprint } from './collision'

export const contactShade = {
  opacity: 0.86,
  margin: 1.25,
  lift: 0.045,
  columns: 4,
  rows: 8,
  fadeHeight: 1.4,
  faintest: 0.2,
}

interface Ground {
  surface(x: number, s: number): { height: number }
}

interface Pose {
  x: number
  s: number
  y: number
  yaw: number
}

export function contactPatch(
  world: Ground,
  pose: Pose,
  footprint: Footprint,
  positions: Float32Array | number[],
) {
  const { columns, rows, margin, lift } = contactShade
  const width = footprint.halfWidth * 2 * margin
  const length = (footprint.front + footprint.rear) * margin
  const centre = (footprint.front - footprint.rear) / 2
  const cos = Math.cos(pose.yaw)
  const sin = Math.sin(pose.yaw)
  let index = 0
  let total = 0
  for (let row = 0; row <= rows; row++) {
    const along = centre + (0.5 - row / rows) * length
    for (let column = 0; column <= columns; column++) {
      const across = (column / columns - 0.5) * width
      const x = pose.x + across * cos - along * sin
      const s = pose.s + across * sin + along * cos
      const height = world.surface(x, s).height
      total += height
      positions[index++] = x
      positions[index++] = height + lift
      positions[index++] = -s
    }
  }
  const ground = total / ((rows + 1) * (columns + 1))
  const gap = Math.max(0, pose.y - ground)
  return {
    ground,
    strength: Math.max(contactShade.faintest, 1 - gap / contactShade.fadeHeight),
  }
}
