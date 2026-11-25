import { Biquad, Blocker, Drift, glide, limit, Noise, Ringer } from './dsp'

const turn = 6.2831853

export const birdSongs = [
  {
    notes: [2, 4],
    length: [0.14, 0.3],
    gap: [0.08, 0.2],
    pitch: [2100, 3600],
    sweep: [-0.12, 0.12],
  },
  {
    notes: [4, 9],
    length: [0.035, 0.07],
    gap: [0.03, 0.08],
    pitch: [3800, 6200],
    sweep: [0.1, 0.4],
  },
  {
    notes: [10, 22],
    length: [0.018, 0.03],
    gap: [0.012, 0.025],
    pitch: [4800, 7200],
    sweep: [-0.2, 0.2],
  },
  {
    notes: [2, 3],
    length: [0.2, 0.42],
    gap: [0.25, 0.5],
    pitch: [900, 1500],
    sweep: [-0.25, -0.05],
  },
] as const

class Bird {
  wait: number
  left = 1
  right = 1
  private notes = 0
  private age = 0
  private length = 0.1
  private gap = 0.1
  private resting = 0
  private from = 3000
  private sweep = 0
  private step = 0
  private phase = 0
  private loud = 0
  private song: (typeof birdSongs)[number] = birdSongs[0]
  constructor(
    private rate: number,
    private noise: Noise,
  ) {
    this.wait = 0.5 + 4 * noise.unit()
  }
  private pick(range: readonly [number, number]) {
    return range[0] + (range[1] - range[0]) * this.noise.unit()
  }
  private note() {
    this.age = 0
    this.length = this.pick(this.song.length)
    this.gap = this.pick(this.song.gap)
    this.sweep = this.pick(this.song.sweep)
    this.from *= 1 + this.step
  }
  advance(dt: number, liveliness: number) {
    if (this.notes > 0 || liveliness <= 0) return
    this.wait -= dt * liveliness
    if (this.wait > 0) return
    this.wait = 0.6 - 2.2 * Math.log(1 - 0.98 * this.noise.unit())
    this.song = birdSongs[(this.noise.unit() * birdSongs.length) | 0] ?? birdSongs[0]
    this.notes = Math.round(this.pick(this.song.notes))
    this.from = this.pick(this.song.pitch)
    this.step = (this.noise.unit() - 0.5) * 0.08
    this.loud = 0.25 + 0.75 * this.noise.unit() ** 2
    const pan = this.noise.unit()
    this.left = Math.cos(pan * 1.5708)
    this.right = Math.sin(pan * 1.5708)
    this.resting = 0
    this.note()
  }
  run() {
    if (this.notes <= 0) return 0
    if (this.resting > 0) {
      this.resting -= 1 / this.rate
      if (this.resting <= 0) this.note()
      return 0
    }
    const along = this.age / this.length
    this.age += 1 / this.rate
    if (along >= 1) {
      this.notes--
      this.resting = this.gap
      return 0
    }
    this.phase += (this.from * (1 + this.sweep * along)) / this.rate
    if (this.phase >= 1) this.phase -= 1
    const swell = Math.sin(along * Math.PI)
    return Math.sin(this.phase * turn) * swell * swell * this.loud
  }
}

class Cricket {
  private clock: number
  private phase = 0
  constructor(
    private rate: number,
    private pitch: number,
    private period: number,
    private pulses: number,
    offset: number,
  ) {
    this.clock = offset
  }
  run() {
    this.clock += 1 / this.rate
    if (this.clock >= this.period) this.clock -= this.period
    const beat = this.clock * 62
    if (beat >= this.pulses) return 0
    this.phase += this.pitch / this.rate
    if (this.phase >= 1) this.phase -= 1
    const swell = Math.sin((beat - Math.floor(beat)) * Math.PI)
    return Math.sin(this.phase * turn) * swell * swell
  }
}

export class AirVoice {
  speed = 0
  rush = 0
  band = 400
  whistle = 0
  whistlePitch = 2600
  buffet = 0
  breeze = 0
  leaves = 0
  rain = 0
  birds = 0
  insects = 0
  cicadas = 0
  water = 0
  surf = 0
  falls = 0
  fallsPan = 0
  private noise: Noise
  private other: Noise
  private windLeft: Biquad
  private windRight: Biquad
  private airLeft: Biquad
  private airRight: Biquad
  private buffetBand: Biquad
  private whistleBand: Biquad
  private leafBand: Biquad
  private rainLow: Biquad
  private rainHigh: Biquad
  private widen: Biquad
  private lapBand: Biquad
  private surfBand: Biquad
  private surfHiss: Biquad
  private fallLow: Biquad
  private fallMid: Biquad
  private fallHigh: Biquad
  private droneBand: Biquad
  private cicadaBand: Biquad
  private glass: [Ringer, Ringer, Ringer]
  private roof: [Ringer, Ringer]
  private nextGlass = 0
  private nextRoof = 0
  private birdsong: [Bird, Bird, Bird]
  private crickets: [Cricket, Cricket, Cricket]
  private gust: Drift
  private gustLeft: Drift
  private gustRight: Drift
  private flurry: Drift
  private thrum: Drift
  private rustle: Drift
  private lap: Drift
  private shimmer: Drift
  private blockers: [Blocker, Blocker, Blocker, Blocker, Blocker]
  private levels = new Float32Array(12)
  private wants = new Float32Array(12)
  private wave = 0
  private wavePace = 0.12
  private cicadaPhase = 0
  private ease: number
  constructor(
    private rate: number,
    seed = 1,
  ) {
    this.noise = new Noise(seed * 2749 + 31)
    this.other = new Noise(seed * 4513 + 9)
    const filter = () => new Biquad(rate)
    this.windLeft = filter()
    this.windRight = filter()
    this.airLeft = filter()
    this.airRight = filter()
    this.buffetBand = filter().lowpass(110, 0.8)
    this.whistleBand = filter()
    this.leafBand = filter().bandpass(4200, 0.6)
    this.rainLow = filter().highpass(1400, 0.5)
    this.rainHigh = filter().lowpass(7500, 0.6)
    this.widen = filter().bandpass(2400, 0.4)
    this.lapBand = filter().lowpass(900, 0.7)
    this.surfBand = filter()
    this.surfHiss = filter().highpass(2600, 0.6)
    this.fallLow = filter().lowpass(450, 0.7)
    this.fallMid = filter().bandpass(1600, 0.5)
    this.fallHigh = filter().highpass(4000, 0.6)
    this.droneBand = filter().bandpass(5900, 7)
    this.cicadaBand = filter().bandpass(6600, 5)
    this.glass = [new Ringer(rate), new Ringer(rate), new Ringer(rate)]
    this.roof = [new Ringer(rate), new Ringer(rate)]
    this.birdsong = [
      new Bird(rate, this.other),
      new Bird(rate, this.other),
      new Bird(rate, this.other),
    ]
    this.crickets = [
      new Cricket(rate, 4350, 0.52, 3, 0),
      new Cricket(rate, 4820, 0.61, 3, 0.21),
      new Cricket(rate, 3960, 0.87, 2, 0.4),
    ]
    const blocks = rate / 128
    this.gust = new Drift(this.noise, 0.28, blocks)
    this.gustLeft = new Drift(this.noise, 1.4, blocks)
    this.gustRight = new Drift(this.noise, 1.4, blocks)
    this.flurry = new Drift(this.noise, 6, blocks)
    this.thrum = new Drift(this.noise, 11, blocks)
    this.rustle = new Drift(this.noise, 0.6, blocks)
    this.lap = new Drift(this.noise, 0.35, blocks)
    this.shimmer = new Drift(this.noise, 17, blocks)
    this.blockers = [
      new Blocker(rate),
      new Blocker(rate),
      new Blocker(rate),
      new Blocker(rate),
      new Blocker(rate),
    ]
    this.ease = glide(0.03, rate)
  }
  render(
    windLeft: Float32Array,
    windRight: Float32Array,
    cabin: Float32Array,
    left: Float32Array,
    right: Float32Array,
    count: number,
  ) {
    const rate = this.rate
    const noise = this.noise
    const other = this.other
    const dt = count / rate
    const speed = Math.abs(this.speed)
    const gust = this.gust.next()
    const flurry = this.flurry.next()
    const swayLeft = limit(1 + 0.22 * gust + 0.13 * this.gustLeft.next() + 0.06 * flurry, 0.3, 1.8)
    const swayRight = limit(
      1 + 0.22 * gust + 0.13 * this.gustRight.next() + 0.06 * flurry,
      0.3,
      1.8,
    )
    this.windLeft.lowpass(this.band * (0.85 + 0.25 * swayLeft), 0.6)
    this.windRight.lowpass(this.band * (0.85 + 0.25 * swayRight), 0.6)
    const calm = 320 + 260 * limit(this.breeze, 0, 1)
    this.airLeft.lowpass(calm * (0.9 + 0.2 * swayLeft), 0.5)
    this.airRight.lowpass(calm * (0.9 + 0.2 * swayRight), 0.5)
    this.whistleBand.bandpass(this.whistlePitch * (1 + 0.02 * flurry), 9)
    const rustle = limit(0.5 + 0.35 * this.rustle.next() + 0.2 * gust, 0, 1.4)
    const lap = limit(0.55 + 0.3 * this.lap.next(), 0.1, 1.3)
    const shimmer = limit(0.7 + 0.2 * this.shimmer.next(), 0.2, 1.2)

    let surge = 0
    if (this.surf > 0.001) {
      this.wave += dt * this.wavePace
      if (this.wave >= 1) {
        this.wave -= 1
        this.wavePace = 1 / (6 + 5 * other.unit())
      }
      const along = this.wave
      surge = along < 0.3 ? (along / 0.3) ** 2 : along < 0.4 ? 1 : Math.exp(-(along - 0.4) * 5.5)
      this.surfBand.lowpass(420 + 2400 * surge, 0.6)
    }
    const wants = this.wants
    wants[0] = this.rush * swayLeft
    wants[1] = this.rush * swayRight
    wants[2] = this.buffet * limit(0.6 + 0.35 * this.thrum.next(), 0, 1.5)
    wants[3] = this.whistle * limit(0.8 + 0.3 * flurry, 0, 1.4)
    wants[4] = this.breeze * swayLeft
    wants[5] = this.leaves * rustle * rustle
    wants[6] = this.rain
    wants[7] = this.water * lap
    wants[8] = this.surf * (0.25 + 0.75 * surge)
    wants[9] = this.falls
    wants[10] = this.insects * shimmer
    wants[11] = this.cicadas

    const pan = limit(this.fallsPan, -1, 1) * 0.7854 + 0.7854
    const fallLeft = Math.cos(pan)
    const fallRight = Math.sin(pan)
    const birdOne = this.birdsong[0]
    const birdTwo = this.birdsong[1]
    const birdThree = this.birdsong[2]
    const calmSky = limit(1 - this.rain * 2, 0, 1)
    const chorus = this.birds * calmSky
    birdOne.advance(dt, chorus)
    birdTwo.advance(dt, chorus)
    birdThree.advance(dt, chorus)
    const cricketOne = this.crickets[0]
    const cricketTwo = this.crickets[1]
    const cricketThree = this.crickets[2]
    const dropChance = (this.rain * (70 + speed * 7)) / rate
    const glassOne = this.glass[0]
    const glassTwo = this.glass[1]
    const glassThree = this.glass[2]
    const roofOne = this.roof[0]
    const roofTwo = this.roof[1]
    const cicadaStep = 118 / rate
    const levels = this.levels
    const ease = this.ease
    let l0 = levels[0] as number
    let l1 = levels[1] as number
    let l2 = levels[2] as number
    let l3 = levels[3] as number
    let l4 = levels[4] as number
    let l5 = levels[5] as number
    let l6 = levels[6] as number
    let l7 = levels[7] as number
    let l8 = levels[8] as number
    let l9 = levels[9] as number
    let l10 = levels[10] as number
    let l11 = levels[11] as number
    const w0 = wants[0] as number
    const w1 = wants[1] as number
    const w2 = wants[2] as number
    const w3 = wants[3] as number
    const w4 = wants[4] as number
    const w5 = wants[5] as number
    const w6 = wants[6] as number
    const w7 = wants[7] as number
    const w8 = wants[8] as number
    const w9 = wants[9] as number
    const w10 = wants[10] as number
    const w11 = wants[11] as number
    const blockLeft = this.blockers[0]
    const blockRight = this.blockers[1]
    const blockCabin = this.blockers[2]
    const blockAmbLeft = this.blockers[3]
    const blockAmbRight = this.blockers[4]
    let cicadaPhase = this.cicadaPhase

    for (let i = 0; i < count; i++) {
      const white = noise.next()
      const grey = other.next()
      l0 += (w0 - l0) * ease
      l1 += (w1 - l1) * ease
      l2 += (w2 - l2) * ease
      l3 += (w3 - l3) * ease
      l4 += (w4 - l4) * ease
      l5 += (w5 - l5) * ease
      l6 += (w6 - l6) * ease
      l7 += (w7 - l7) * ease
      l8 += (w8 - l8) * ease
      l9 += (w9 - l9) * ease
      l10 += (w10 - l10) * ease
      l11 += (w11 - l11) * ease
      let blowLeft = 0
      let blowRight = 0
      if (l0 + l1 + l2 + l3 > 0.0002) {
        const thrum = this.buffetBand.run(white) * 3.2 * l2
        const whistle = this.whistleBand.run(grey) * 2.2 * l3
        blowLeft = this.windLeft.run(white) * 4.4 * l0 + thrum + whistle * 0.8
        blowRight = this.windRight.run(grey) * 4.4 * l1 + thrum + whistle * 0.55
      }
      windLeft[i] = blockLeft.run(blowLeft)
      windRight[i] = blockRight.run(blowRight)

      let ambientLeft = 0
      let ambientRight = 0
      if (l4 > 0.0002) {
        ambientLeft += this.airLeft.run(white) * 2 * l4
        ambientRight += this.airRight.run(grey) * 2 * l4
      }
      let wide = 0
      let centre = 0
      if (l5 > 0.0002) centre += this.leafBand.run(white) * 0.7 * l5
      let drumming = 0
      if (l6 > 0.0002) {
        centre += this.rainHigh.run(this.rainLow.run(white)) * 0.8 * l6
        if (noise.unit() < dropChance) {
          const force = noise.unit()
          if (noise.unit() < 0.6) {
            const ringer =
              this.nextGlass === 0 ? glassOne : this.nextGlass === 1 ? glassTwo : glassThree
            this.nextGlass = (this.nextGlass + 1) % 3
            ringer.strike(2300 + 3200 * noise.unit(), 0.0025, force * force * 0.11)
          } else {
            const ringer = this.nextRoof === 0 ? roofOne : roofTwo
            this.nextRoof = (this.nextRoof + 1) % 2
            ringer.strike(280 + 560 * noise.unit(), 0.007, force * force * 0.14)
          }
        }
        drumming =
          glassOne.run() + glassTwo.run() + glassThree.run() + roofOne.run() + roofTwo.run()
      }
      if (l7 > 0.0002) centre += this.lapBand.run(white) * 1.4 * l7
      if (l8 > 0.0002)
        centre += (this.surfBand.run(white) * 1.5 + this.surfHiss.run(white) * 0.25) * l8
      if (l5 + l6 + l8 > 0.0002) wide = this.widen.run(grey) * 0.5 * (l5 + l6 * 0.8 + l8 * 0.5)
      if (l9 > 0.0002) {
        const rush =
          (this.fallLow.run(white) * 1.6 +
            this.fallMid.run(white) * 0.9 +
            this.fallHigh.run(grey) * 0.3) *
          l9
        ambientLeft += rush * fallLeft
        ambientRight += rush * fallRight
      }
      if (l10 > 0.0002) {
        const one = cricketOne.run()
        const two = cricketTwo.run()
        const three = cricketThree.run()
        const drone = this.droneBand.run(white) * 1.2
        ambientLeft += (one * 0.9 + two * 0.2 + three * 0.5 + drone) * 0.1 * l10
        ambientRight += (one * 0.2 + two * 0.9 + three * 0.5 + drone) * 0.1 * l10
      }
      if (l11 > 0.0002) {
        cicadaPhase += cicadaStep
        if (cicadaPhase >= 1) cicadaPhase -= 1
        const rasp = cicadaPhase < 0.5 ? 1 : 0.25
        centre += this.cicadaBand.run(grey) * rasp * 0.35 * l11
      }
      if (chorus > 0) {
        const one = birdOne.run()
        const two = birdTwo.run()
        const three = birdThree.run()
        ambientLeft +=
          (one * birdOne.left + two * birdTwo.left + three * birdThree.left) * 0.16 * chorus
        ambientRight +=
          (one * birdOne.right + two * birdTwo.right + three * birdThree.right) * 0.16 * chorus
      }
      cabin[i] = blockCabin.run(drumming)
      left[i] = blockAmbLeft.run(ambientLeft + centre + wide)
      right[i] = blockAmbRight.run(ambientRight + centre - wide)
    }
    levels[0] = l0
    levels[1] = l1
    levels[2] = l2
    levels[3] = l3
    levels[4] = l4
    levels[5] = l5
    levels[6] = l6
    levels[7] = l7
    levels[8] = l8
    levels[9] = l9
    levels[10] = l10
    levels[11] = l11
    this.cicadaPhase = cicadaPhase
  }
}
