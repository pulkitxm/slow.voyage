export interface Step {
  time: number
  begin?: () => void
  run?: (progress: number, dt: number) => void
  until?: () => boolean
  end?: () => void
}

export interface Stage {
  label: string
  tracks: Track[]
}

const waitWeight = 1.6

export class Track {
  index = 0
  clock = 0
  private begun = false
  private weights: number[]
  private total: number
  constructor(public steps: Step[]) {
    this.weights = steps.map((step) => step.time + (step.until ? waitWeight : 0) + 0.01)
    this.total = this.weights.reduce((sum, weight) => sum + weight, 0)
  }
  get done() {
    return this.index >= this.steps.length
  }
  get progress() {
    if (this.done || this.total <= 0) return 1
    let passed = 0
    for (let index = 0; index < this.index; index++) passed += this.weights[index] as number
    const step = this.steps[this.index] as Step
    const within = step.time > 0 ? Math.min(1, this.clock / step.time) : this.begun ? 0.5 : 0
    return (passed + within * (this.weights[this.index] as number) * 0.98) / this.total
  }
  update(dt: number) {
    let left = dt
    for (let guard = 0; guard < 24 && !this.done; guard++) {
      const step = this.steps[this.index] as Step
      if (!this.begun) {
        this.begun = true
        this.clock = 0
        step.begin?.()
      }
      this.clock += left
      const over = step.time > 0 ? Math.max(0, this.clock - step.time) : left
      const progress = step.time > 0 ? Math.min(1, this.clock / step.time) : 1
      step.run?.(progress, left - (step.time > 0 ? over : 0))
      if (progress < 1 || (step.until && !step.until())) return
      step.end?.()
      this.index++
      this.begun = false
      left = step.until ? 0 : over
    }
  }
}

export function stageProgress(stages: readonly Stage[], index: number) {
  if (!stages.length) return 1
  const stage = stages[index]
  if (!stage) return 1
  let within = 1
  if (stage.tracks.length) {
    within = 0
    for (const track of stage.tracks) within += track.progress
    within /= stage.tracks.length
  }
  return (index + within) / stages.length
}

export function stageDone(stage: Stage) {
  for (const track of stage.tracks) if (!track.done) return false
  return true
}

export function ease(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function easeOut(t: number) {
  const x = 1 - Math.min(1, Math.max(0, t))
  return 1 - x * x * x
}

export function easeBack(t: number) {
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + 2.2 * x * x * x + 1.2 * x * x
}

export function span(t: number, from: number, to: number) {
  return Math.min(1, Math.max(0, (t - from) / (to - from)))
}
