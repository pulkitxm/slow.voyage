import type { Matrix4 } from 'three'
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

interface Resting {
  x: number
  y: number
  s: number
  yaw: number
  slopeX: number
  slopeS: number
}

export const restingShade = { lift: 0.06 }

export function layShade(matrix: Matrix4, spot: Resting, width: number, length: number) {
  const scale = 1 / Math.hypot(spot.slopeX, 1, spot.slopeS)
  const upX = -spot.slopeX * scale
  const upY = scale
  const upZ = spot.slopeS * scale
  const cos = Math.cos(spot.yaw)
  const sin = Math.sin(spot.yaw)
  const lean = cos * upX - sin * upZ
  let sideX = cos - upX * lean
  let sideY = -upY * lean
  let sideZ = -sin - upZ * lean
  const side = 1 / Math.hypot(sideX, sideY, sideZ)
  sideX *= side
  sideY *= side
  sideZ *= side
  const aheadX = sideY * upZ - sideZ * upY
  const aheadY = sideZ * upX - sideX * upZ
  const aheadZ = sideX * upY - sideY * upX
  return matrix.set(
    sideX * width,
    upX,
    aheadX * length,
    spot.x,
    sideY * width,
    upY,
    aheadY * length,
    spot.y + restingShade.lift,
    sideZ * width,
    upZ,
    aheadZ * length,
    -spot.s,
    0,
    0,
    0,
    1,
  )
}
