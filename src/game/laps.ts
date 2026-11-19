import { worldLoop } from './field'

export class LapClock {
  lap = 0
  time = 0
  last: number | null = null
  best: number | null = null
  timed = false

  reset(s: number) {
    this.lap = Math.floor(s / worldLoop.length)
    this.time = 0
    this.last = this.best = null
    this.timed = false
  }

  step(s: number, dt: number) {
    this.time += dt
    const current = Math.floor(s / worldLoop.length)
    if (current === this.lap) return null
    const forward = current > this.lap
    const completed = forward && this.timed
    const time = this.time
    this.lap = current
    this.time = 0
    this.timed = forward
    if (!completed) return null
    this.last = time
    const record = this.best === null || time < this.best
    if (record) this.best = time
    return { time, record }
  }
}

export function formatLap(seconds: number) {
  const tenths = Math.floor(Math.max(0, seconds) * 10)
  const minutes = Math.floor(tenths / 600)
  const rest = tenths - minutes * 600
  return `${minutes}:${String(Math.floor(rest / 10)).padStart(2, '0')}.${rest % 10}`
}
