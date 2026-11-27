import { random } from './world'

export interface CrackleInput {
  revs: number
  throttle: number
  load: number
  shifts: number
  pops: number
  sport: boolean
}

export const crackleTiming = {
  lift: 0.4,
  revs: 0.32,
  coast: 0.1,
  window: { stock: 0.8, sport: 2.2 },
  gap: { shortest: 0.028, spread: 0.2 },
  warm: 1.4,
  cool: 3.5,
  shiftRevs: 0.55,
  shiftThrottle: 0.6,
} as const

export class ExhaustCrackle {
  heat = 0
  window = 0
  span = 1
  fired = 0
  private held = 0
  private next = 0
  private echo = 0
  private seenShifts = -1
  private rng: () => number
  constructor(seed = 7) {
    this.rng = random(seed * 4111 + 3)
  }
  reset() {
    this.heat = this.window = this.held = this.next = this.echo = this.fired = 0
    this.seenShifts = -1
  }
  step(dt: number, input: CrackleInput) {
    this.fired = 0
    if (!input.pops || dt <= 0) {
      this.window = 0
      this.held = input.throttle
      return 0
    }
    const revs = Math.max(0, Math.min(1, input.revs))
    const throttle = Math.max(0, Math.min(1, input.throttle))
    const stoked = Math.max(0, Math.min(1, input.load)) * revs
    const rate = stoked > this.heat ? crackleTiming.warm : crackleTiming.cool
    this.heat += (stoked - this.heat) * (1 - Math.exp(-dt / rate))
    this.held =
      throttle > this.held
        ? throttle
        : this.held + (throttle - this.held) * (1 - Math.exp(-dt / 0.12))
    const sportShare = input.sport ? 1 : 0
    if (this.held - throttle > crackleTiming.lift && revs > crackleTiming.revs) {
      this.span = input.sport ? crackleTiming.window.sport : crackleTiming.window.stock
      this.window = this.span * (0.6 + 0.4 * revs)
      this.held = throttle
      this.next = 0.02 + this.rng() * 0.05
    }
    if (this.seenShifts < 0) this.seenShifts = input.shifts
    if (input.shifts !== this.seenShifts) {
      this.seenShifts = input.shifts
      if (revs > crackleTiming.shiftRevs && throttle > crackleTiming.shiftThrottle) {
        this.echo = 0.035 + this.rng() * 0.03
        return this.fire((0.55 + 0.35 * this.rng()) * (0.7 + 0.3 * sportShare), input.pops)
      }
    }
    if (this.echo > 0) {
      this.echo -= dt
      if (this.echo <= 0 && this.rng() < 0.5 + 0.4 * sportShare)
        return this.fire((0.35 + 0.3 * this.rng()) * (0.7 + 0.3 * sportShare), input.pops)
    }
    const coasting = throttle < crackleTiming.coast
    if (!coasting) {
      this.window = Math.max(0, this.window - dt * 3)
      return 0
    }
    this.window = Math.max(0, this.window - dt)
    const lingering = input.sport && revs > 0.45 && this.heat > 0.15 ? 0.12 : 0
    if (this.window <= 0 && !lingering) return 0
    if (revs < crackleTiming.revs * 0.7) return 0
    this.next -= dt
    if (this.next > 0) return 0
    const left = this.window > 0 ? this.window / this.span : 0
    const chance = Math.min(1, input.pops * (0.55 + 0.6 * sportShare) * (0.3 + left) + lingering)
    const spacing = crackleTiming.gap.shortest + crackleTiming.gap.spread * this.rng() ** 2
    this.next = spacing * (left > 0 ? 1 + (1 - left) * 1.5 : 4)
    if (this.rng() > chance) return 0
    const warmth = 0.55 + 0.45 * Math.min(1, this.heat * 2.2)
    const strength = (0.35 + 0.65 * this.rng()) * warmth * (0.55 + 0.45 * Math.max(left, 0.4))
    return this.fire(strength * (input.sport ? 1 : 0.6), input.pops)
  }
  private fire(strength: number, pops: number) {
    this.fired = Math.max(0, Math.min(1, strength * (0.6 + 0.4 * pops)))
    return this.fired
  }
}
