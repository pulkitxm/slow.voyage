import { Biquad, Blocker, Drift, glide, limit, Noise, Ringer } from './dsp'

const turn = 6.2831853

class Screech {
  level = 0
  pitch = 1000
  rough = 0
  noisy = 0.35
  private phase = 0
  private fed = 0
  private gain = 0
  private jitter = 0
  private shake = 0
  private tuned = 1000
  private band: Biquad
  private blocker: Blocker
  private slow: Drift
  private slower: Drift
  private ease: number
  constructor(
    private rate: number,
    noise: Noise,
    private skew: number,
  ) {
    this.band = new Biquad(rate)
    this.blocker = new Blocker(rate, 180)
    this.slow = new Drift(noise, 3.1, rate / 128)
    this.slower = new Drift(noise, 0.45, rate / 128)
    this.ease = glide(0.025, rate)
  }
  prepare() {
    if (this.level < 0.0005 && this.gain < 0.0005) return
    this.tuned = this.pitch * this.skew * (1 + 0.022 * this.slow.next() + 0.03 * this.slower.next())
    this.band.bandpass(this.tuned * 1.52, 14)
  }
  run(white: number) {
    this.gain += (this.level - this.gain) * this.ease
    if (this.gain < 0.0005) return 0
    this.jitter += (white - this.jitter) * 0.02
    this.shake += (white - this.shake) * 0.006
    this.phase += (this.tuned * (1 + this.jitter * (0.12 + 0.5 * this.rough))) / this.rate
    if (this.phase >= 1) this.phase -= 1
    this.fed = Math.sin(this.phase * turn + 0.9 * this.fed)
    const body = this.fed * (1 - this.noisy) + this.band.run(white) * 9 * this.noisy
    const grip = 1 - this.rough * limit(0.5 + this.shake * 11, 0, 1)
    return this.blocker.run(body * grip * this.gain)
  }
}

export class RoadVoice {
  speed = 0
  roll = 0
  wet = 0
  gravel = 0
  grass = 0
  grains = 0
  squealLeft = 0
  squealRight = 0
  pitch = 1000
  rough = 0
  skid = 0
  scrub = 0
  joint = 0
  jointLevel = 0
  wheelbase = 2.6
  bumps = 0
  bumpStrength = 0
  heft = 1
  scrape = 0
  metal = 0
  wade = 0
  brake = 0
  private noise: Noise
  private side: Noise
  private low: Biquad
  private mid: Biquad
  private hum: Biquad
  private texture: Biquad
  private spray: Biquad
  private bed: Biquad
  private bedRumble: Biquad
  private swish: Biquad
  private blades: Biquad
  private scrubBand: Biquad
  private width: Biquad
  private grainBands: [Biquad, Biquad, Biquad]
  private grainLevels = new Float32Array(3)
  private grainFades = new Float32Array(3)
  private pings: [Ringer, Ringer, Ringer]
  private tok: Ringer
  private thunk: Ringer
  private click: Ringer
  private thump: Ringer
  private thudBand: Biquad
  private scrapeBand: Biquad
  private ringLow: Biquad
  private ringHigh: Biquad
  private wadeBand: Biquad
  private splash: Biquad
  private left: Screech
  private right: Screech
  private lock: Screech
  private rumbleDrift: Drift
  private sprayDrift: Drift
  private grassDrift: Drift
  private crunchDrift: Drift
  private wadeDrift: Drift
  private brakeDrift: Drift
  private leftBlocker: Blocker
  private rightBlocker: Blocker
  private debrisBlocker: Blocker
  private levels = new Float32Array(12)
  private nextPing = 0
  private travelled = 0
  private rearDue = -1
  private rearForce = 0
  private seenBumps = -1
  private thud = 0
  private chatter = 0
  private brakePhase = 0
  private brakePitch = 3150
  constructor(
    private rate: number,
    seed = 1,
  ) {
    this.noise = new Noise(seed * 3571 + 5)
    this.side = new Noise(seed * 1289 + 77)
    const filter = () => new Biquad(rate)
    this.low = filter()
    this.mid = filter()
    this.hum = filter()
    this.texture = filter().lowpass(85, 0.8)
    this.spray = filter().highpass(2200, 0.6)
    this.bed = filter().bandpass(1300, 0.6)
    this.bedRumble = filter().lowpass(140, 1)
    this.swish = filter().bandpass(650, 0.5)
    this.blades = filter().highpass(3000, 0.7)
    this.scrubBand = filter()
    this.width = filter().bandpass(1200, 0.5)
    this.grainBands = [
      filter().bandpass(900, 1.5),
      filter().bandpass(1900, 2),
      filter().bandpass(3400, 2.5),
    ]
    this.grainFades.set([
      Math.exp(-1 / (0.006 * rate)),
      Math.exp(-1 / (0.0035 * rate)),
      Math.exp(-1 / (0.002 * rate)),
    ])
    this.pings = [new Ringer(rate), new Ringer(rate), new Ringer(rate)]
    this.tok = new Ringer(rate)
    this.thunk = new Ringer(rate)
    this.click = new Ringer(rate)
    this.thump = new Ringer(rate)
    this.thudBand = filter().lowpass(300, 0.8)
    this.scrapeBand = filter()
    this.ringLow = filter()
    this.ringHigh = filter()
    this.wadeBand = filter()
    this.splash = filter().highpass(2500, 0.6)
    this.left = new Screech(rate, this.noise, 1)
    this.right = new Screech(rate, this.noise, 1.047)
    this.lock = new Screech(rate, this.noise, 0.58)
    this.lock.noisy = 0.6
    const blocks = rate / 128
    this.rumbleDrift = new Drift(this.noise, 2, blocks)
    this.sprayDrift = new Drift(this.noise, 5, blocks)
    this.grassDrift = new Drift(this.noise, 3, blocks)
    this.crunchDrift = new Drift(this.noise, 9, blocks)
    this.wadeDrift = new Drift(this.noise, 4, blocks)
    this.brakeDrift = new Drift(this.noise, 6, blocks)
    this.leftBlocker = new Blocker(rate)
    this.rightBlocker = new Blocker(rate)
    this.debrisBlocker = new Blocker(rate)
  }
  render(left: Float32Array, right: Float32Array, debris: Float32Array, count: number) {
    const rate = this.rate
    const noise = this.noise
    const speed = Math.abs(this.speed)
    const dt = count / rate
    this.low.lowpass(300 + speed * 22, 0.7)
    this.mid.bandpass(950 + speed * 5, 0.9)
    this.hum.bandpass(limit(speed * 27, 180, 1500), 5)
    this.scrubBand.bandpass(380 + speed * 9, 0.8)
    this.scrapeBand.bandpass(this.metal > 0.5 ? 1700 + speed * 40 : 600 + speed * 10, 2.2)
    this.ringLow.bandpass(1730 + speed * 6, 18)
    this.ringHigh.bandpass(2890 + speed * 9, 22)
    this.wadeBand.lowpass(700 + speed * 25, 1.2)
    this.left.pitch = this.right.pitch = this.lock.pitch = this.pitch
    this.left.level = this.squealLeft
    this.right.level = this.squealRight
    this.left.rough = this.right.rough = this.rough
    this.lock.level = this.skid
    this.lock.rough = 0.75
    this.left.prepare()
    this.right.prepare()
    this.lock.prepare()

    const target = this.levels
    const roll = this.roll
    const w0 = roll
    const w1 = roll * 1.1 * (1 + 0.35 * this.rumbleDrift.next())
    const w2 = this.wet * (0.6 + 0.2 * this.sprayDrift.next())
    const w3 = this.gravel * (0.75 + 0.2 * this.crunchDrift.next())
    const w4 = this.grass * (0.7 + 0.25 * this.grassDrift.next())
    const w5 = this.scrub
    const w6 = this.scrape
    const w7 = this.wade * (0.75 + 0.25 * this.wadeDrift.next())
    const w8 = this.brake
    this.brakePitch = 3150 * (1 + 0.004 * this.brakeDrift.next())
    const ease = glide(0.03, rate)
    const metal = this.metal > 0.5 ? 1 : 0
    const splash = limit(speed / 28, 0, 1) ** 1.5

    if (this.joint > 0 && speed > 1.5) {
      this.travelled += speed * dt
      if (this.travelled >= this.joint) {
        this.travelled %= this.joint
        const force = this.jointLevel * limit(speed / 18, 0.3, 1)
        this.strikeJoint(force)
        this.rearDue = Math.round((this.wheelbase / speed) * rate)
        this.rearForce = force * 0.8
      }
    }
    if (this.seenBumps < 0) this.seenBumps = this.bumps
    if (this.bumps !== this.seenBumps) {
      this.seenBumps = this.bumps
      const force = limit(this.bumpStrength, 0, 1)
      this.thump.strike((62 + 14 * noise.unit()) / Math.sqrt(this.heft), 0.05, force * 0.11)
      this.thud = Math.max(this.thud, force)
    }
    const grainChance = this.grains / rate
    const thudFade = Math.exp(-1 / (0.02 * rate))
    const fadeLow = this.grainFades[0] as number
    const fadeMid = this.grainFades[1] as number
    const fadeHigh = this.grainFades[2] as number
    const grainLevels = this.grainLevels
    const bandLow = this.grainBands[0]
    const bandMid = this.grainBands[1]
    const bandHigh = this.grainBands[2]
    const pingOne = this.pings[0]
    const pingTwo = this.pings[1]
    const pingThree = this.pings[2]
    let thud = this.thud
    let chatter = this.chatter
    let brakePhase = this.brakePhase
    let l0 = target[0] as number
    let l1 = target[1] as number
    let l2 = target[2] as number
    let l3 = target[3] as number
    let l4 = target[4] as number
    let l5 = target[5] as number
    let l6 = target[6] as number
    let l7 = target[7] as number
    let l8 = target[8] as number
    const active =
      roll + this.wet + this.gravel + this.grass + this.scrub > 0.0002 || l0 + l3 + l4 > 0.0002

    for (let i = 0; i < count; i++) {
      const white = noise.next()
      l0 += (w0 - l0) * ease
      l1 += (w1 - l1) * ease
      l2 += (w2 - l2) * ease
      l3 += (w3 - l3) * ease
      l4 += (w4 - l4) * ease
      l5 += (w5 - l5) * ease
      l6 += (w6 - l6) * ease
      l7 += (w7 - l7) * ease
      l8 += (w8 - l8) * ease
      let centre = 0
      let spread = 0
      if (active) {
        centre =
          (this.low.run(white) * 2.1 + this.mid.run(white) * 0.8 + this.hum.run(white) * 0.6) * l0 +
          this.texture.run(white) * 3 * l1 +
          this.spray.run(white) * l2 * splash +
          (this.bed.run(white) * 1.4 + this.bedRumble.run(white) * 3.4) * l3 +
          (this.swish.run(white) * 0.8 + this.blades.run(white) * 0.2) * l4 +
          this.scrubBand.run(white) * 1.6 * l5
        spread = this.width.run(this.side.next()) * 0.55 * (l0 + l2 * 0.5 + l3 + l4 + l5)
      }
      const skid = this.lock.run(white)
      left[i] = this.leftBlocker.run(centre + spread + this.left.run(white) + skid * 0.7)
      right[i] = this.rightBlocker.run(centre - spread + this.right.run(white) + skid * 0.7)

      let loose = 0
      if (grainChance > 0 && noise.unit() < grainChance) {
        const force = 0.3 + 0.7 * noise.unit()
        const pick = (noise.unit() * 3) | 0
        grainLevels[pick] = Math.max(grainLevels[pick] as number, force)
        const kind = noise.unit()
        if (kind < 0.07) {
          const ringer = this.nextPing === 0 ? pingOne : this.nextPing === 1 ? pingTwo : pingThree
          this.nextPing = (this.nextPing + 1) % 3
          ringer.strike(1700 + 2200 * noise.unit(), 0.008 + 0.02 * noise.unit(), force * 0.12)
        } else if (kind < 0.25) this.tok.strike(240 + 280 * noise.unit(), 0.01, force * 0.1)
      }
      const g0 = grainLevels[0] as number
      const g1 = grainLevels[1] as number
      const g2 = grainLevels[2] as number
      if (g0 + g1 + g2 > 0.0001) {
        loose =
          bandLow.run(white * g0) * 1.1 + bandMid.run(white * g1) + bandHigh.run(white * g2) * 0.9
        grainLevels[0] = g0 * fadeLow
        grainLevels[1] = g1 * fadeMid
        grainLevels[2] = g2 * fadeHigh
      }
      loose += pingOne.run() + pingTwo.run() + pingThree.run() + this.tok.run()
      if (this.rearDue >= 0 && this.rearDue-- === 0) this.strikeJoint(this.rearForce)
      thud *= thudFade
      let knocks = this.thunk.run() + this.click.run() + this.thump.run()
      if (thud > 0.0005) knocks += this.thudBand.run(white * thud) * 0.5
      let grind = 0
      if (l6 > 0.0005) {
        chatter += (white - chatter) * 0.008
        const bite = limit(0.55 + chatter * 9, 0.1, 1.2)
        grind =
          (this.scrapeBand.run(white) * 1.4 +
            (this.ringLow.run(white) + this.ringHigh.run(white) * 0.7) * 5 * metal) *
          bite *
          l6
      }
      let water = 0
      if (l7 > 0.0005) water = (this.wadeBand.run(white) * 1.5 + this.splash.run(white) * 0.3) * l7
      let squeak = 0
      if (l8 > 0.0005) {
        brakePhase += this.brakePitch / rate
        if (brakePhase >= 1) brakePhase -= 1
        squeak = (Math.sin(brakePhase * turn) + 0.3 * Math.sin(brakePhase * turn * 2.07)) * l8
      }
      debris[i] = this.debrisBlocker.run(loose + knocks + grind + water + squeak)
    }
    target[0] = l0
    target[1] = l1
    target[2] = l2
    target[3] = l3
    target[4] = l4
    target[5] = l5
    target[6] = l6
    target[7] = l7
    target[8] = l8
    this.thud = thud
    this.chatter = chatter
    this.brakePhase = brakePhase
  }
  private strikeJoint(force: number) {
    this.thunk.strike(88 + 16 * this.noise.unit(), 0.022, force * 0.09)
    this.click.strike(410 + 90 * this.noise.unit(), 0.006, force * 0.05)
    this.thud = Math.max(this.thud, force * 0.25)
  }
}
