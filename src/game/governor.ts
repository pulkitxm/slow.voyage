export const governorPlan = {
  frame: 1 / 60,
  strained: 1.15,
  dropped: 1.6,
  crawling: 2.5,
  comfortable: 1.06,
  loaded: 0.8,
  aim: 0.7,
  spare: 0.55,
  stale: 4,
  strikes: 3,
  window: 30,
  pause: 0.5,
  floor: 0.6,
  step: 0.05,
  plunge: 0.75,
  grace: 3,
  recovery: 4,
  probation: 6,
  patience: 16,
  linger: 30,
  longestCounted: 0.1,
} as const

export const reliefLevels = { full: 0, flat: 1, plain: 2 } as const

export type GovernorVerdict = 'adjust' | 'fallback' | 'lighten' | null

export class FrameGovernor {
  scale = 1
  relief = 0
  median = 0
  tail = 0
  load = 0
  private frames = new Float32Array(governorPlan.window)
  private sorted = new Float32Array(governorPlan.window)
  private loads = new Float32Array(governorPlan.window)
  private loadCount = 0
  private loadCursor = 0
  private stale = 0
  private quiet: number = governorPlan.window
  private strikes = 0
  private stalls = 0
  private upper = 0
  private count = 0
  private cursor = 0
  private rest = 0
  private grace = 0
  private ease = 0
  private shed = 0
  private raised = Number.POSITIVE_INFINITY
  private backoff = 1
  private probing = false
  private trying = false
  private proven = false
  private keptScale = 1
  private keptRelief = 0

  hold(seconds: number = governorPlan.grace) {
    this.grace = Math.max(this.grace, seconds)
    this.count = 0
    this.ease = 0
  }

  reset() {
    this.scale = 1
    this.relief = 0
    this.shed = 0
    this.backoff = 1
    this.probing = false
    this.trying = false
    this.proven = false
    this.raised = Number.POSITIVE_INFINITY
    this.hold()
  }

  step(
    elapsed: number,
    busy: boolean,
    capped: boolean,
    governing: boolean,
    load = 0,
  ): GovernorVerdict {
    const counted = Math.min(elapsed, governorPlan.longestCounted)
    if (busy) {
      this.count = 0
      this.ease = 0
      return null
    }
    if (this.grace > 0) {
      this.grace = Math.max(0, this.grace - counted)
      return null
    }
    this.quiet = load > 0 ? 0 : this.quiet + 1
    if (load > 0 && this.stale-- <= 0) {
      this.loads[this.loadCursor] = load
      this.loadCursor = (this.loadCursor + 1) % governorPlan.window
      this.loadCount = Math.min(this.loadCount + 1, governorPlan.window)
    }
    this.frames[this.cursor] = elapsed
    this.cursor = (this.cursor + 1) % governorPlan.window
    this.count = Math.min(this.count + 1, governorPlan.window)
    this.rest -= counted
    this.raised += counted
    this.shed = this.relief === reliefLevels.plain ? this.shed + counted : 0
    if (this.count < governorPlan.window || this.rest > 0) return null
    const timed = this.quiet < governorPlan.window
    if (governing && timed && this.loadCount < governorPlan.window) return null
    const waited = governorPlan.pause - this.rest
    this.rest = governorPlan.pause
    this.sorted.set(this.frames)
    this.sorted.sort()
    this.median = this.sorted[governorPlan.window >> 1] ?? 0
    this.tail = this.sorted[Math.floor(governorPlan.window * 0.95)] ?? 0
    this.upper = this.sorted[Math.floor(governorPlan.window * 0.9)] ?? 0
    this.load = 0
    if (timed && this.loadCount === governorPlan.window) {
      this.sorted.set(this.loads)
      this.sorted.sort()
      this.load = this.sorted[governorPlan.window >> 1] ?? 0
    }
    return governing ? this.decide(waited, capped) : null
  }

  private decide(waited: number, capped: boolean): GovernorVerdict {
    const { frame } = governorPlan
    const measured = this.load > 0
    if (!capped || measured) this.proven = this.trying = false
    else if (!this.proven) {
      if (this.scale > governorPlan.floor || this.relief < reliefLevels.plain) {
        this.trying = true
        this.keptScale = this.scale
        this.keptRelief = this.relief
        return this.settle(governorPlan.floor, reliefLevels.plain)
      }
      this.proven = true
      if (this.trying) {
        this.trying = false
        return this.settle(this.keptScale, this.keptRelief)
      }
    }
    const strained = measured
      ? this.load > frame * governorPlan.loaded
      : !capped &&
        (this.median > frame * governorPlan.strained || this.upper > frame * governorPlan.dropped)
    if (strained) {
      this.ease = 0
      if (this.probing) this.backoff = Math.min(this.backoff * 2, governorPlan.patience)
      this.probing = false
      if (this.scale > governorPlan.floor) {
        const heavy = measured || this.median > frame * governorPlan.dropped
        const room = measured ? (frame * governorPlan.aim) / this.load : frame / this.median
        const eased = this.scale * Math.max(measured ? 0 : governorPlan.plunge, Math.sqrt(room))
        return this.settle(Math.min(this.scale - governorPlan.step, heavy ? eased : 1), this.relief)
      }
      if (++this.strikes < governorPlan.strikes) return null
      this.strikes = 0
      if (this.relief < reliefLevels.plain) return this.settle(this.scale, this.relief + 1)
      return 'fallback'
    }
    this.strikes = 0
    if (measured && !capped && this.median > frame * governorPlan.crawling) {
      if (++this.stalls < governorPlan.strikes) return null
      this.stalls = 0
      return 'lighten'
    }
    this.stalls = 0
    if (this.shed > governorPlan.linger) return 'fallback'
    if (this.probing && this.raised >= governorPlan.probation) {
      this.probing = false
      this.backoff = 1
    }
    const calm = measured
      ? this.load < frame * governorPlan.spare
      : capped || this.upper < frame * governorPlan.comfortable
    this.ease = calm ? this.ease + waited : 0
    if (this.ease < governorPlan.recovery * this.backoff) return null
    if (this.relief === reliefLevels.full && this.scale >= 1) return null
    this.ease = 0
    this.raised = 0
    this.probing = true
    return this.relief > reliefLevels.full
      ? this.settle(this.scale, this.relief - 1)
      : this.settle(this.scale + governorPlan.step * (this.backoff === 1 ? 2 : 1), this.relief)
  }

  private settle(scale: number, relief: number): GovernorVerdict {
    this.scale = Math.max(governorPlan.floor, Math.min(1, Math.round(scale * 20) / 20))
    this.relief = relief
    this.count = 0
    this.loadCount = 0
    this.stale = governorPlan.stale
    return 'adjust'
  }
}
