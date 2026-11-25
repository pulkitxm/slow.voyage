const quiet = 1e-25

export function limit(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value))
}

export function glide(seconds: number, rate: number) {
  return 1 - Math.exp(-1 / Math.max(1, seconds * rate))
}

export class Noise {
  private state: number
  constructor(seed: number) {
    this.state = seed | 0 || 0x9e3779b9
  }
  next() {
    let state = this.state
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    this.state = state
    return state * 4.656612873077393e-10
  }
  unit() {
    return this.next() * 0.5 + 0.5
  }
}

export class Biquad {
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private z1 = 0
  private z2 = 0
  constructor(private rate: number) {}
  private angle(frequency: number) {
    return (2 * Math.PI * limit(frequency, 10, this.rate * 0.45)) / this.rate
  }
  lowpass(frequency: number, q: number) {
    const w = this.angle(frequency)
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b1 = (1 - cos) / a0
    this.b0 = this.b2 = this.b1 * 0.5
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
    return this
  }
  highpass(frequency: number, q: number) {
    const w = this.angle(frequency)
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b1 = -(1 + cos) / a0
    this.b0 = this.b2 = -this.b1 * 0.5
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
    return this
  }
  bandpass(frequency: number, q: number) {
    const w = this.angle(frequency)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = alpha / a0
    this.b1 = 0
    this.b2 = -this.b0
    this.a1 = (-2 * Math.cos(w)) / a0
    this.a2 = (1 - alpha) / a0
    return this
  }
  peak(frequency: number, q: number, decibels: number) {
    const w = this.angle(frequency)
    const amount = 10 ** (decibels / 40)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha / amount
    this.b0 = (1 + alpha * amount) / a0
    this.b1 = (-2 * Math.cos(w)) / a0
    this.b2 = (1 - alpha * amount) / a0
    this.a1 = this.b1
    this.a2 = (1 - alpha / amount) / a0
    return this
  }
  run(input: number) {
    const output = this.b0 * input + this.z1
    this.z1 = this.b1 * input - this.a1 * output + this.z2 + quiet
    this.z2 = this.b2 * input - this.a2 * output
    return output
  }
  clear() {
    this.z1 = this.z2 = 0
  }
}

export class Ringer {
  private c1 = 0
  private c2 = 0
  private y1 = 0
  private y2 = 0
  constructor(private rate: number) {}
  strike(frequency: number, seconds: number, force: number) {
    const radius = Math.exp(-1 / Math.max(1, seconds * this.rate))
    const w = (2 * Math.PI * limit(frequency, 20, this.rate * 0.45)) / this.rate
    this.c1 = 2 * radius * Math.cos(w)
    this.c2 = -radius * radius
    this.y1 += force * Math.sin(w)
  }
  run() {
    const output = this.c1 * this.y1 + this.c2 * this.y2 + quiet
    this.y2 = this.y1
    this.y1 = output
    return output
  }
}

export class Pipe {
  private line: Float32Array
  private at = 0
  private length = 1
  private shade = 0
  private mix = 0.5
  constructor(
    private rate: number,
    longest: number,
  ) {
    this.line = new Float32Array(Math.ceil(rate * longest) + 2)
  }
  tune(resonance: number, damping: number) {
    this.length = limit(Math.round(this.rate / (2 * resonance)), 1, this.line.length - 1)
    this.mix = 1 - Math.exp((-2 * Math.PI * limit(damping, 50, this.rate * 0.45)) / this.rate)
    return this
  }
  run(input: number, reflection: number) {
    const line = this.line
    let from = this.at - this.length
    if (from < 0) from += line.length
    this.shade += ((line[from] as number) - this.shade) * this.mix + quiet
    const output = input - reflection * this.shade
    line[this.at] = output
    this.at = this.at + 1 === line.length ? 0 : this.at + 1
    return output
  }
  clear() {
    this.line.fill(0)
    this.shade = 0
  }
}

export class Drift {
  private value = 0
  private mix: number
  private scale: number
  constructor(
    private noise: Noise,
    frequency: number,
    rate: number,
  ) {
    this.mix = limit(1 - Math.exp((-2 * Math.PI * frequency) / rate), 0.00001, 1)
    this.scale = Math.sqrt((3 * (2 - this.mix)) / this.mix)
  }
  next() {
    this.value += (this.noise.next() - this.value) * this.mix
    return limit(this.value * this.scale, -2.5, 2.5)
  }
}

export class Blocker {
  private last = 0
  private held = 0
  private pole: number
  constructor(rate: number, frequency = 22) {
    this.pole = 1 - (2 * Math.PI * frequency) / rate
  }
  run(input: number) {
    this.held = input - this.last + this.pole * this.held + quiet
    this.last = input
    return this.held
  }
}
