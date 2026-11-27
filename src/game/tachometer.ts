export const tachStart = -160
export const tachEnd = 95

export interface TachScale {
  max: number
  ticks: number[]
  labels: number[]
  shift: number
  redline: number
}

export function tachScale(redline: number): TachScale {
  const max = Math.floor(redline / 1000) * 1000 + 1000
  const tick = max <= 4000 ? 500 : 1000
  const label = max <= 10000 ? 1000 : max <= 14000 ? 2000 : 5000
  const ticks: number[] = []
  const labels: number[] = []
  for (let rpm = 0; rpm <= max; rpm += tick) ticks.push(rpm)
  for (let rpm = 0; rpm <= max; rpm += label) labels.push(rpm)
  return { max, ticks, labels, shift: redline * 0.9, redline }
}

export const tachRpm = (revs: number, redline: number) => Math.max(0, Math.min(1, revs)) * redline

export const tachAngle = (rpm: number, max: number) =>
  tachStart + (Math.max(0, Math.min(max, rpm)) / max) * (tachEnd - tachStart)

export const needleSpring = { frequency: 26, damping: 0.72, substep: 1 / 240 }

export interface Needle {
  position: number
  velocity: number
}

export function stepNeedle(needle: Needle, target: number, dt: number, calm = false): Needle {
  const omega = needleSpring.frequency
  const zeta = calm ? 1 : needleSpring.damping
  const goal = Math.max(0, Math.min(1, target))
  const steps = Math.max(1, Math.ceil(dt / needleSpring.substep))
  const h = dt / steps
  let { position, velocity } = needle
  for (let step = 0; step < steps; step++) {
    velocity += (omega * omega * (goal - position) - 2 * zeta * omega * velocity) * h
    position += velocity * h
    if (position < 0) {
      position = 0
      velocity = Math.max(0, velocity)
    } else if (position > 1) {
      position = 1
      velocity = Math.min(0, velocity)
    }
  }
  return { position, velocity }
}
