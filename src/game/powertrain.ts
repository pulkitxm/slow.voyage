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
}

export class Gearbox {
  gear = 1
  rpm: number
  load = 0
  shifting = 0
  shifts = 0
  constructor(public profile: EngineProfile) {
    this.rpm = profile.idle
  }
  reset(profile = this.profile) {
    this.profile = profile
    this.gear = 1
    this.rpm = profile.idle
    this.load = 0
    this.shifting = 0
  }
  engagedRpm(speed: number, gear = this.gear) {
    const top = this.profile.gearTops[gear - 1] ?? 1
    return (this.profile.redline * Math.abs(speed)) / top
  }
  update(speed: number, throttle: number, dt: number) {
    const profile = this.profile
    const drive = clamp(throttle, 0, 1)
    this.shifting = Math.max(0, this.shifting - dt)
    if (speed < -0.1) this.gear = 1
    else if (this.shifting === 0) this.selectGear(speed, drive)
    const launching = this.gear === 1 && Math.abs(speed) < (profile.gearTops[0] ?? 1) * 0.35
    const clutch = launching
      ? profile.idle + (profile.redline - profile.idle) * profile.launch * drive
      : 0
    const target = Math.min(profile.redline, Math.max(profile.idle, this.engagedRpm(speed), clutch))
    const rate = this.shifting > 0 ? profile.revRate * 0.7 : profile.revRate
    this.rpm = damp(this.rpm, target, rate, dt)
    this.load = damp(this.load, this.shifting > 0 ? 0 : drive, 12, dt)
  }
  label(speed: number) {
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
