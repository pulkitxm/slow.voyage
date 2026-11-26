import * as THREE from 'three'
import { type Landscape, landscapeProfiles } from './landscapes'
import { type EffectsLevel, Particles, particleKind } from './particles'
import type { CarPhysics } from './physics'
import { roadCoordinates, roadLayout } from './road'
import type { WheelState } from './suspension'
import type { Settings, World } from './world'

export const effectsLayout = {
  smokeSlip: 0.38,
  smokeSpan: 0.35,
  dustStart: 2.5,
  dustFull: 24,
  sprayStart: 7,
  sprayFull: 30,
  dropStart: 10,
  dropFull: 22,
  frontSpray: 0.4,
  sparkScrape: 2,
  sparkHold: 0.35,
} as const

const dustTones: Record<Landscape, string> = {
  highlands: '#bdb092',
  alpine: '#b7b0a2',
  desert: '#e3c899',
  forest: '#a08b6c',
  canyon: '#dc9f6e',
  fjord: '#b0aa90',
  jungle: '#977c5c',
}

const plumeRates = { smoke: 70, dust: 50, spray: 300, splash: 340 } as const
const dropRates = { spray: 600, splash: 800 } as const

const winds: Record<Settings['weather'], number> = {
  clear: 1.1,
  overcast: 1.8,
  rain: 2.6,
  storm: 6,
  fog: 0.3,
}

export function effectsLevel(software: boolean, quality: Settings['quality'], ultra: boolean) {
  if (software || quality === 'low') return 'off' as const
  return ultra ? ('ultra' as const) : ('high' as const)
}

export interface Plume {
  kind: 'smoke' | 'dust' | 'spray' | 'splash' | null
  strength: number
  water: number
}

export function wheelPlume(
  out: Plume,
  wheel: Pick<WheelState, 'onRoad' | 'sand' | 'slip' | 'locked' | 'puddle' | 'contact'>,
  speed: number,
  ground: { wet: boolean; snowy: boolean; wading: boolean; cover: number },
) {
  out.kind = null
  out.strength = 0
  out.water = 0
  if (!wheel.contact) return out
  if (ground.wading) {
    out.kind = 'splash'
    out.strength = Math.min(1, speed / 14)
    out.water = 1
    return out
  }
  if (!wheel.onRoad) {
    if (ground.wet && !ground.snowy) return out
    const pace =
      (speed - effectsLayout.dustStart) / (effectsLayout.dustFull - effectsLayout.dustStart)
    if (pace <= 0) return out
    out.kind = 'dust'
    out.strength = Math.min(1, pace) * ground.cover * (1 + Math.min(1, wheel.slip))
    return out
  }
  const spin = Math.max(
    (wheel.slip - effectsLayout.smokeSlip) / effectsLayout.smokeSpan,
    wheel.locked && speed > 4 ? 0.7 : 0,
  )
  if (spin > 0 && !ground.wet) {
    out.kind = 'smoke'
    out.strength = Math.min(1, spin)
    return out
  }
  const pace =
    (speed - effectsLayout.sprayStart) / (effectsLayout.sprayFull - effectsLayout.sprayStart)
  if (ground.wet && pace > 0) {
    out.kind = 'spray'
    out.water = Math.min(1, wheel.puddle * 1.5)
    out.strength = Math.min(1, pace) ** 0.8 * (0.65 + out.water * 0.5)
    out.strength += Math.max(0, spin) * 0.4
  }
  return out
}

export class RoadEffects {
  particles: Particles
  private carry = new Float32Array(16)
  private dropCarry = new Float32Array(16)
  private plume: Plume = { kind: null, strength: 0, water: 0 }
  private dust = new THREE.Color()
  private verge = new THREE.Color()
  private pale = new THREE.Color('#f6efe2')
  private smoke = new THREE.Color('#d7dbdd')
  private mist = new THREE.Color('#dfe7ec')
  private drop = new THREE.Color('#c4d0d8')
  private spark = new THREE.Color()
  private emberRail = new THREE.Color(14, 6.5, 2)
  private emberRock = new THREE.Color(12, 4.5, 1.2)
  private tone = new THREE.Color()
  private wet = false
  private snowy = false
  private grassy = false
  private hits = 0
  private sparkCarry = 0
  private grind = { left: 0, pace: 0, x: 0, s: 0, outX: 0, outZ: 0, rock: false }

  constructor(noise: THREE.IUniform) {
    this.particles = new Particles(noise)
  }

  setLevel(level: EffectsLevel) {
    this.particles.setLevel(level)
  }

  setScene(settings: Settings, wet: boolean) {
    const winter = settings.season === 'winter'
    const landscape = landscapeProfiles[settings.landscape]
    this.wet = wet
    this.snowy = winter
    this.grassy = !winter && landscape.grass >= 5000
    this.dust.set(winter ? '#f3f6f8' : dustTones[settings.landscape])
    this.verge.set(winter ? '#e8ecee' : (landscape.field?.gravel ?? '#b3ab9c'))
    this.verge.lerp(this.dust, 0.35).lerp(this.pale, 0.25)
    this.dust.lerp(this.pale, 0.3)
    const wind = this.particles.light.wind.value
    wind.set(0.94, 0, 0.33).multiplyScalar(winds[settings.weather])
  }

  update(p: CarPhysics, world: World, active: boolean, seconds: number, dt: number) {
    const particles = this.particles
    if (!particles.capacity) return
    const speed = Math.abs(p.speed)
    const forwardX = -Math.sin(p.yaw)
    const forwardZ = -Math.cos(p.yaw)
    const rightX = Math.cos(p.yaw)
    const rightZ = -Math.sin(p.yaw)
    const moveX = forwardX * p.speed + rightX * p.lateralSpeed
    const moveZ = forwardZ * p.speed + rightZ * p.lateralSpeed
    const scale = particles.rate * dt
    const wheels = p.suspension.wheels
    for (let index = 0; index < wheels.length; index++) {
      const wheel = wheels[index]
      if (!wheel) continue
      if (!active) {
        this.carry[index] = this.dropCarry[index] = 0
        continue
      }
      let cover = 0
      if (!wheel.onRoad && !p.wading) {
        const verge =
          Math.abs(roadCoordinates(world, wheel.x, wheel.s).distance) <
          roadLayout.halfWidth + roadLayout.shoulder + roadLayout.verge
        cover = this.snowy ? 1 : wheel.sand ? 1.15 : verge ? 0.95 : this.grassy ? 0.28 : 0.8
        this.tone.copy(verge ? this.verge : this.dust)
      }
      const plume = wheelPlume(this.plume, wheel, speed, {
        wet: this.wet,
        snowy: this.snowy,
        wading: p.wading > 0,
        cover,
      })
      if (plume.kind === 'spray' || plume.kind === 'splash') {
        const share = wheel.front && wheels.length > 2 ? effectsLayout.frontSpray : 1
        this.spray(index, wheel, plume.kind, plume.strength, plume.water, share, p, seconds, dt)
        continue
      }
      this.dropCarry[index] = 0
      if (!plume.kind) {
        this.carry[index] = 0
        continue
      }
      const outward = Math.sign(wheel.localX)
      const x = wheel.x + forwardX * -0.3
      const z = -wheel.s + forwardZ * -0.3
      const y = wheel.ground
      let carry = this.carry[index] ?? 0
      carry += plumeRates[plume.kind] * plume.strength * scale
      while (carry >= 1) {
        carry -= 1
        const r1 = Math.random() - 0.5
        const r2 = Math.random() - 0.5
        const r3 = Math.random()
        if (plume.kind === 'smoke') {
          particles.emit(
            particleKind.smoke,
            x + r1 * 0.3,
            y + 0.22,
            z + r2 * 0.3,
            moveX * 0.28 + r1 * 1.6 + rightX * outward * 0.5,
            0.25 + r3 * 0.6,
            moveZ * 0.28 + r2 * 1.6 + rightZ * outward * 0.5,
            2.6 + r3 * 1.8,
            0.6,
            3.8,
            0.22,
            this.smoke,
            0.36 + plume.strength * 0.34,
            seconds,
          )
        } else if (plume.kind === 'dust') {
          const lift = Math.min(1, speed / effectsLayout.dustFull)
          particles.emit(
            particleKind.dust,
            x + r1 * 0.4,
            y + 0.2,
            z + r2 * 0.4,
            moveX * 0.5 + r1 * 1.6 + rightX * outward * (1 + r3 * 2.2 * lift),
            0.8 + r3 * 3 * lift,
            moveZ * 0.5 + r2 * 1.6 + rightZ * outward * (1 + r3 * 2.2 * lift),
            2.2 + r3 * 2,
            0.45 + lift * 0.2,
            2.4 + lift * 1.4,
            0.2,
            this.tone,
            Math.min(0.7, 0.34 + plume.strength * 0.3),
            seconds,
          )
        }
      }
      this.carry[index] = carry
    }
    this.sparks(p, active, moveX, moveZ, seconds, dt)
    particles.update(seconds)
  }

  private spray(
    index: number,
    wheel: WheelState,
    kind: 'spray' | 'splash',
    strength: number,
    water: number,
    share: number,
    p: CarPhysics,
    seconds: number,
    dt: number,
  ) {
    const particles = this.particles
    const rightX = Math.cos(p.yaw)
    const rightZ = -Math.sin(p.yaw)
    const moveX = -Math.sin(p.yaw) * p.speed + rightX * p.lateralSpeed
    const moveZ = -Math.cos(p.yaw) * p.speed + rightZ * p.lateralSpeed
    const speed = Math.hypot(moveX, moveZ)
    const pace = Math.min(1, speed / effectsLayout.sprayFull)
    const throwing = 0.3 + pace * 0.7
    const heel = 0.16 / Math.max(speed, 1)
    const x = wheel.x - moveX * heel
    const z = -wheel.s - moveZ * heel
    const y = wheel.ground
    const outward = Math.sign(wheel.localX)
    const level = strength * share * particles.rate * dt
    const fill = 1 / Math.sqrt(particles.rate)
    let carry = (this.carry[index] ?? 0) + plumeRates[kind] * level
    while (carry >= 1) {
      carry -= 1
      const lag = Math.random() * dt
      const r1 = Math.random() - 0.5
      const r2 = Math.random() - 0.5
      const r3 = Math.random()
      const keep = 0.3 + Math.random() * 0.3
      const fan = (outward || Math.sign(r1)) * (0.15 + r3 * (0.9 + water * 1.2))
      const lift = 0.05 + r3 * r3 * 0.3
      particles.emit(
        particleKind.mist,
        x - moveX * lag + r1 * 0.14,
        y + lift,
        z - moveZ * lag + r2 * 0.14,
        moveX * keep + rightX * fan + r1 * 1.6,
        (1.2 + Math.random() * 4.2) * throwing * (1 + water * 0.5),
        moveZ * keep + rightZ * fan + r2 * 1.6,
        0.55 + Math.random() * 0.95,
        (0.17 + water * 0.07) * Math.sqrt(fill),
        3.6,
        lift,
        this.mist,
        Math.min(1, (0.45 + strength * 0.3) * fill),
        seconds - lag,
      )
    }
    this.carry[index] = carry
    const fast =
      kind === 'splash'
        ? 1
        : (speed - effectsLayout.dropStart) / (effectsLayout.dropFull - effectsLayout.dropStart)
    let drops =
      (this.dropCarry[index] ?? 0) + dropRates[kind] * level * Math.min(1, Math.max(0, fast))
    while (drops >= 1) {
      drops -= 1
      const lag = Math.random() * dt
      const d1 = Math.random() - 0.5
      const d2 = Math.random()
      const d3 = Math.random()
      const keep = 0.5 + d3 * 0.35
      const fan = (outward || Math.sign(d1)) * (0.2 + d2 * (1.1 + water * 3.2)) + d1 * 0.7
      particles.emit(
        particleKind.drop,
        x - moveX * lag + rightX * d1 * 0.2,
        y + 0.05,
        z - moveZ * lag + rightZ * d1 * 0.2,
        moveX * keep + rightX * fan,
        (0.7 + d3 * d3 * 4.4) * throwing * (1 + water * 0.7),
        moveZ * keep + rightZ * fan,
        0.12 + d3 * 0.22,
        0.005 + d2 * 0.004,
        0,
        0.05,
        this.drop,
        0.8,
        seconds - lag,
      )
    }
    this.dropCarry[index] = drops
  }

  private sparks(
    p: CarPhysics,
    active: boolean,
    moveX: number,
    moveZ: number,
    seconds: number,
    dt: number,
  ) {
    const fresh = p.hits !== this.hits
    this.hits = p.hits
    const grind = this.grind
    if (!active) {
      grind.left = 0
      return
    }
    const hard = p.scrapeMaterial === 'rail' || p.scrapeMaterial === 'rock'
    if (p.scrape > effectsLayout.sparkScrape && hard) {
      grind.left = effectsLayout.sparkHold
      grind.pace = Math.min(p.scrape, 30)
      grind.x = p.scrapeX - p.x
      grind.s = p.scrapeS - p.s
      grind.outX = p.scrapeNormalX
      grind.outZ = -p.scrapeNormalS
      grind.rock = p.scrapeMaterial === 'rock'
    }
    const share = Math.max(0.6, this.particles.rate)
    let count = 0
    if (grind.left > 0) {
      this.sparkCarry += (50 + grind.pace * 9) * (grind.left / effectsLayout.sparkHold) * share * dt
      count = Math.floor(this.sparkCarry)
      this.sparkCarry -= count
      grind.left -= dt
    } else this.sparkCarry = 0
    if (fresh && (p.hitMaterial === 'rail' || p.hitMaterial === 'rock'))
      count += Math.round((20 + p.hitStrength * 60) * share)
    if (!count) return
    const ember = grind.rock ? this.emberRock : this.emberRail
    const originX = p.x + grind.x + grind.outX * 0.12
    const originZ = -(p.s + grind.s) + grind.outZ * 0.12
    for (let index = 0; index < count; index++) {
      const r1 = Math.random() - 0.5
      const r2 = Math.random() - 0.5
      const r3 = Math.random()
      const kick = r3 * 1.4
      const lift = 0.3 + Math.random() * 0.3
      this.spark.copy(ember).multiplyScalar(0.5 + r3 * 0.8)
      this.particles.emit(
        particleKind.spark,
        originX + r1 * 0.35,
        p.y + lift,
        originZ + r2 * 0.35,
        moveX * (0.35 + r3 * 0.55) + grind.outX * kick + r1 * 3,
        0.8 + Math.random() * 3.6,
        moveZ * (0.35 + r3 * 0.55) + grind.outZ * kick + r2 * 3,
        0.35 + Math.random() * 0.6,
        0.012 + r3 * 0.01,
        0,
        lift,
        this.spark,
        1,
        seconds,
      )
    }
  }

  dispose() {
    this.particles.dispose()
  }
}
