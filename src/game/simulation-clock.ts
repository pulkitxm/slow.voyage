export class SimulationClock {
  readonly step = 1 / 120
  accumulator = 0
  advance(elapsed: number, simulate: (dt: number) => void) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return 0
    this.accumulator += Math.min(elapsed, 0.25)
    const steps = Math.floor((this.accumulator + 1e-9) / this.step)
    this.accumulator = Math.max(0, this.accumulator - steps * this.step)
    for (let index = 0; index < steps; index++) simulate(this.step)
    return steps
  }
  reset() {
    this.accumulator = 0
  }
}
