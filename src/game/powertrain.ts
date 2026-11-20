import { clamp, damp, type Vehicle } from './world'

export interface EngineProfile {
  idle: number
  redline: number
  cruiseShift: number
  upshift: number
  downshift: number
  gearTops: readonly number[]
  shiftSeconds: number
  launch: number
  revRate: number
}

export const engineProfiles: Record<Vehicle, EngineProfile> = {
  touring: {
    idle: 780,
    redline: 6500,
    cruiseShift: 2400,
    upshift: 5900,
    downshift: 1250,
    gearTops: [13, 22, 32, 42, 52, 64],
    shiftSeconds: 0.28,
    launch: 0.26,
    revRate: 9,
  },
  roadster: {
    idle: 900,
    redline: 7400,
    cruiseShift: 3000,
    upshift: 7000,
    downshift: 1550,
    gearTops: [15, 25, 35, 45, 56, 68],
    shiftSeconds: 0.18,
    launch: 0.34,
    revRate: 12,
  },
  motorcycle: {
    idle: 1300,
    redline: 11500,
    cruiseShift: 4800,
    upshift: 11000,
    downshift: 2700,
    gearTops: [14, 22, 30, 38, 47, 57],
    shiftSeconds: 0.1,
    launch: 0.3,
    revRate: 18,
  },
  bus: {
    idle: 620,
    redline: 2500,
    cruiseShift: 1500,
    upshift: 2250,
    downshift: 740,
    gearTops: [5, 9, 14, 20, 28, 38],
    shiftSeconds: 0.55,
    launch: 0.35,
    revRate: 4,
  },
  pickup: {
    idle: 700,
    redline: 4600,
    cruiseShift: 1900,
    upshift: 4100,
    downshift: 950,
    gearTops: [8, 14, 21, 29, 39, 50],
    shiftSeconds: 0.4,
    launch: 0.3,
    revRate: 6,
  },
  hatchback: {
    idle: 850,
    redline: 6800,
    cruiseShift: 2600,
    upshift: 6200,
    downshift: 1300,
    gearTops: [11, 19, 28, 38, 50],
    shiftSeconds: 0.24,
    launch: 0.28,
    revRate: 11,
  },
  supercar: {
    idle: 1000,
    redline: 8800,
    cruiseShift: 3200,
    upshift: 8400,
    downshift: 1700,
    gearTops: [17, 28, 39, 51, 64, 77, 92],
    shiftSeconds: 0.08,
    launch: 0.4,
    revRate: 16,
  },
}

export const stickShift = {
  curve: [
    [0, 0.3],
    [0.12, 0.45],
    [0.3, 0.76],
    [0.5, 0.96],
    [0.75, 1.08],
    [0.9, 1],
    [1, 0.82],
    [1.02, 0],
  ],
  launch: 0.55,
  limiter: 0.985,
  bounce: 13,
  dip: 0.045,
  overRev: 1.03,
  reverseBelow: 1.2,
  braking: { base: 0.25, revs: 1.5, leverage: 2.4 },
} as const

export function torqueShare(revs: number) {
  const curve = stickShift.curve
  if (revs <= 0) return curve[0]?.[1] ?? 0
  for (let index = 1; index < curve.length; index++) {
    const [to, high] = curve[index] ?? [1, 0]
    const [from, low] = curve[index - 1] ?? [0, 0]
    if (revs <= to) return low + ((high - low) * (revs - from)) / (to - from)
  }
  return 0
}

export class Gearbox {
  gear = 1
  rpm: number
  load = 0
  shifting = 0
  shifts = 0
  manual = false
  limited = false
  private clock = 0
  constructor(public profile: EngineProfile) {
    this.rpm = profile.idle
  }
  reset(profile = this.profile) {
    this.profile = profile
    this.gear = 1
    this.rpm = profile.idle
    this.load = 0
    this.shifting = 0
    this.limited = false
  }
  engagedRpm(speed: number, gear = this.gear) {
    const top = this.profile.gearTops[Math.max(1, gear) - 1] ?? 1
    return (this.profile.redline * Math.abs(speed)) / top
  }
  revs(speed: number) {
    return this.engagedRpm(speed) / this.profile.redline
  }
  request(direction: number, speed: number) {
    if (!direction || this.shifting > 0) return false
    const tops = this.profile.gearTops
    if (direction > 0) {
      if (this.gear < 0) {
        if (Math.abs(speed) > stickShift.reverseBelow) return false
        this.gear = 1
      } else if (this.gear < tops.length) this.gear++
      else return false
    } else if (this.gear > 1) {
      if (this.engagedRpm(speed, this.gear - 1) > this.profile.redline * stickShift.overRev)
        return false
      this.gear--
    } else if (this.gear === 1 && Math.abs(speed) <= stickShift.reverseBelow) this.gear = -1
    else return false
    this.shifting = this.profile.shiftSeconds * (direction > 0 ? 1 : 0.7)
    this.shifts++
    return true
  }
  pull(speed: number) {
    if (this.shifting > 0) return 0
    const revs = this.revs(speed)
    return torqueShare(Math.abs(this.gear) === 1 ? Math.max(revs, stickShift.launch) : revs)
  }
  engineBraking(speed: number) {
    const tops = this.profile.gearTops
    const top = tops[Math.max(1, this.gear) - 1] ?? 1
    const tallest = tops[tops.length - 1] ?? top
    const { base, revs, leverage } = stickShift.braking
    return (
      (base + revs * Math.min(1, this.revs(speed))) * Math.min(leverage, Math.sqrt(tallest / top))
    )
  }
  update(speed: number, throttle: number, dt: number, manual = false) {
    const profile = this.profile
    const drive = clamp(throttle, 0, 1)
    this.shifting = Math.max(0, this.shifting - dt)
    this.clock += dt
    if (manual !== this.manual) {
      this.manual = manual
      if (!manual && this.gear < 0) this.gear = 1
    }
    if (!manual) {
      if (speed < -0.1) this.gear = 1
      else if (this.shifting === 0) this.selectGear(speed, drive)
    }
    const first = Math.abs(this.gear) === 1
    const launching = first && Math.abs(speed) < (profile.gearTops[0] ?? 1) * 0.35
    const clutch = launching
      ? profile.idle + (profile.redline - profile.idle) * profile.launch * drive
      : 0
    const engaged = this.engagedRpm(speed)
    this.limited = manual && drive > 0.2 && engaged >= profile.redline * stickShift.limiter
    const ceiling = this.limited
      ? profile.redline *
        (1 - stickShift.dip * (Math.sin(this.clock * stickShift.bounce * Math.PI * 2) > 0 ? 1 : 0))
      : profile.redline
    const target = Math.min(ceiling, Math.max(profile.idle, engaged, clutch))
    const rate = this.shifting > 0 ? profile.revRate * 0.7 : profile.revRate
    this.rpm = damp(this.rpm, target, this.limited ? 60 : rate, dt)
    const cut = this.limited && target < profile.redline ? 0.25 : 1
    this.load = damp(this.load, this.shifting > 0 ? 0 : drive * cut, this.limited ? 60 : 12, dt)
  }
  label(speed: number) {
    if (this.manual) return this.gear < 0 ? 'R' : String(this.gear)
    if (speed < -0.1) return 'R'
    if (speed < 0.1 && this.load < 0.05) return 'N'
    return String(this.gear)
  }
  private selectGear(speed: number, throttle: number) {
    const profile = this.profile
    const engaged = this.engagedRpm(speed)
    const upshiftAt = profile.cruiseShift + (profile.upshift - profile.cruiseShift) * throttle
    if (this.gear < profile.gearTops.length && engaged > upshiftAt) {
      this.shift(1)
    } else if (this.gear > 1) {
      const lower = this.engagedRpm(speed, this.gear - 1)
      const kickdown =
        throttle > 0.9 && engaged < profile.upshift * 0.55 && lower < profile.upshift * 0.85
      if (engaged < profile.downshift || kickdown) this.shift(-1)
    }
  }
  private shift(direction: 1 | -1) {
    this.gear += direction
    this.shifting = this.profile.shiftSeconds * (direction > 0 ? 1 : 0.7)
    this.shifts++
  }
}
