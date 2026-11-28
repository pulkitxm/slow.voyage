import { engineVoiceIndex } from './engine-sound'
import { fitCar } from './engines'
import { landscapeProfiles } from './landscapes'
import type { CarPhysics, Input } from './physics'
import {
  brakeSquealLevel,
  freshTyreSignals,
  grassLevel,
  gravelLevel,
  gravelRate,
  looseGround,
  mixLevels,
  rainLevel,
  roadJoints,
  roadLevel,
  scrapeLevel,
  scrubLevel,
  skidLevel,
  squealLevel,
  squealPitch,
  squealRoughness,
  suspensionThump,
  thumpStrength,
  tyreSignals,
  vehicleWeight,
  wadeLevel,
  wetLevel,
  windLayers,
} from './sound-design'
import { freshParams, paramIndex } from './sound-synth'
import type { Ambience } from './soundscape'
import { engineIds, type Settings } from './world'

export class SoundFrame {
  values = freshParams()
  private tyres = freshTyreSignals()
  private pressed = new Float32Array(8)
  private touching = new Uint8Array(8)
  private settled = false
  private bumps = 0
  private rest = 0
  pops = 0
  popLevel = 0
  pop(strength: number) {
    if (strength <= 0) return
    this.pops = (this.pops + 1) % 65536
    this.popLevel = strength
  }
  reset() {
    this.settled = false
  }
  update(car: CarPhysics, input: Input, settings: Settings, ambience: Ambience, dt: number) {
    const v = this.values
    const at = paramIndex
    const vehicle = settings.vehicle
    const fitted = fitCar(settings)
    const profile = fitted.profile
    const box = car.gearbox
    const speed = Math.abs(car.speed)
    v[at.vehicle] = engineVoiceIndex(settings)
    v[at.engine] = fitted.engine ? engineIds.indexOf(fitted.engine) : 0
    v[at.rpm] = box.rpm
    v[at.idle] = profile.idle
    v[at.redline] = profile.redline
    v[at.load] = box.load
    v[at.throttle] =
      !box.neutral && (car.speed < -0.1 || box.gear < 0) ? input.brake : input.throttle
    v[at.cutting] = box.cutting ? 1 : 0
    v[at.shifts] = box.shifts
    v[at.clunk] = box.manual ? 1 : 0.3
    v[at.pops] = this.pops
    v[at.popLevel] = this.popLevel * mixLevels.pops
    v[at.speed] = car.speed

    const wheels = car.suspension.wheels
    const tyres = this.tyres
    let jolt = 0
    let landing = false
    for (let index = 0; index < wheels.length && index < 8; index++) {
      const wheel = wheels[index]
      if (!wheel) continue
      if (this.settled && dt > 0) {
        jolt = Math.max(jolt, (wheel.compression - (this.pressed[index] as number)) / dt)
        if (wheel.contact && !this.touching[index]) landing = true
      }
      this.pressed[index] = wheel.compression
      this.touching[index] = wheel.contact ? 1 : 0
    }
    this.settled = true
    this.rest -= dt
    const thump = thumpStrength(jolt, landing) * Math.min(1, 0.25 + speed / 12)
    if (thump > 0.02 && this.rest <= 0) {
      this.rest = suspensionThump.rest
      this.bumps = (this.bumps + 1) % 65536
      v[at.bumpStrength] = thump * mixLevels.thump
    }
    v[at.bumps] = this.bumps
    v[at.heft] = vehicleWeight[vehicle]

    tyreSignals(wheels, tyres)
    const winter = settings.season === 'winter'
    const film = winter ? 0 : wetLevel(settings.weather, tyres.puddle)
    const dry = 1 - 0.8 * film
    const tarmac = tyres.tarmac
    v[at.roll] = roadLevel(speed, false) * tarmac * mixLevels.road
    v[at.wet] = film * tarmac * mixLevels.road * 1.3
    const ground = looseGround(
      settings.landscape,
      settings.season,
      landscapeProfiles[settings.landscape].grass >= 5000,
    )
    const sandy = tyres.sand > tyres.loose * 0.5
    const loose = Math.min(1, tyres.loose * 2)
    const crunch = gravelLevel(speed, loose > 0, sandy, car.slip) * loose
    const stony = sandy ? 1 : ground.gravel
    v[at.gravel] = crunch * stony * mixLevels.gravel
    v[at.grass] = (sandy ? 0 : grassLevel(speed, car.slip)) * loose * ground.grass * mixLevels.grass
    v[at.grains] = gravelRate(speed, loose > 0, sandy) * loose * ground.gravel
    const left = squealLevel(tyres.left, speed, false) * dry
    const right = squealLevel(tyres.right, speed, false) * dry
    const loudest = Math.max(left, right)
    v[at.squealLeft] = left * mixLevels.squeal
    v[at.squealRight] = right * mixLevels.squeal
    v[at.squealPitch] = squealPitch(vehicle, loudest, speed) * (1 + 0.22 * Math.min(1, tyres.spin))
    v[at.rough] = squealRoughness(Math.max(tyres.left, tyres.right), tyres.spin)
    v[at.skid] = skidLevel(tyres.locked, speed) * dry * mixLevels.skid
    v[at.scrub] = scrubLevel(car.slip, speed, tarmac < 0.5) * mixLevels.scrub
    v[at.joint] = tarmac > 0.5 ? roadJoints.spacing : 0
    v[at.jointLevel] = roadJoints.level[settings.roadWear] * mixLevels.joints
    v[at.wheelbase] = fitted.metrics.wheelbase
    v[at.scrape] = scrapeLevel(car.scrapeMaterial, car.scrape) * mixLevels.scrape
    v[at.metal] = car.scrapeMaterial === 'rail' ? 1 : 0
    v[at.wade] = wadeLevel(car.wading, speed) * mixLevels.wade
    v[at.brake] =
      brakeSquealLevel(speed, input.brake) * mixLevels.brakeSqueal * (vehicle === 'bus' ? 1.8 : 1)

    const surge = car.boosting ? 1 : 0
    const wind = windLayers(speed, 0)
    v[at.rush] = wind.rush * mixLevels.wind * (1 + surge)
    v[at.band] = wind.band + surge * 900
    v[at.whistle] = wind.whistle * mixLevels.whistle
    v[at.whistlePitch] = wind.whistlePitch
    v[at.buffet] = wind.buffet * mixLevels.buffet
    const level = mixLevels.ambience
    v[at.breeze] = ambience.breeze * mixLevels.breeze
    v[at.leaves] = ambience.leaves * level * 0.12
    v[at.rain] = winter ? 0 : rainLevel(settings.weather) * mixLevels.rain
    v[at.birds] = ambience.birds * level
    v[at.insects] = ambience.insects * level
    v[at.cicadas] = ambience.cicadas * level * 0.12
    v[at.water] = ambience.water * level * 0.12
    v[at.surf] = ambience.surf * level * 0.22
    v[at.falls] = Math.min(1.2, ambience.falls) * level * 0.3
    return v
  }
}
