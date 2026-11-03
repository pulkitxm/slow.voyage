import { type BarrierContact, resolveBarrierImpulse } from './barrier'
import { cruiseLimits, cruisePedals, reverseDriveFactor } from './cruise'
import { forwardDriveForce } from './drive'
import { surfaceGrip } from './grip'
import { guardrailAt, roadCoordinates, roadLayout } from './road'
import { stabilize } from './stability'
import { Steering, steeringLimit } from './steering'
import { Suspension } from './suspension'
import { solveTires } from './tires'
import { vehicleMetrics } from './vehicles'
import {
  angleDifference,
  clamp,
  damp,
  type Settings,
  type SteeringSource,
  type World,
} from './world'

export interface Input {
  throttle: number
  boost: boolean
  brake: number
  steer: number
  steeringSource: SteeringSource | null
  handbrake: boolean
  regenBrake: number
}
export interface Telemetry {
  speed: number
  boost: boolean
  distance: number
  altitude: number
  steering: number
  slip: number
  offroad: boolean
  gear: string
  impact: number
}
function tractionAcceleration(settings: Settings, onRoad: boolean) {
  return surfaceGrip(settings, onRoad) * 9.81
}
const directionChangeSpeed = 0.05
const brakeResponseSeconds = 0.1
const gripSteeringShare = 1.5

export class CarPhysics {
  x = 0
  s = 180
  y = 0
  yaw = 0
  pitch = 0
  roll = 0
  pitchRate = 0
  rollRate = 0
  speed = 0
  steeringControl = new Steering()
  yawRate = 0
  lateralSpeed = 0
  verticalSpeed = 0
  distance = 0
  slip = 0
  impact = 0
  driveForce = 0
  boosting = false
  brakeForce = 0
  offroad = false
  stability = 0
  tireSteeringLimit = Number.POSITIVE_INFINITY
  suspension: Suspension
  constructor(public world: World) {
    this.suspension = new Suspension(world)
    this.reset()
  }
  get steering() {
    return clamp(this.steeringControl.angle, -this.tireSteeringLimit, this.tireSteeringLimit)
  }
  reset(s = this.s) {
    this.s = s
    this.driveForce = this.brakeForce = 0
    this.boosting = false
    const road = this.world.road(s)
    this.x = road.x
    this.y = road.y
    this.yaw = road.yaw
    this.speed = this.yawRate = this.lateralSpeed = this.verticalSpeed = 0
    this.steeringControl.reset()
    this.tireSteeringLimit = Number.POSITIVE_INFINITY
    this.suspension.reset(this)
  }
  routeSpeed(targetSpeed: number) {
    const direction = targetSpeed < 0 ? -1 : 1
    const settings = this.world.settings
    const metrics = vehicleMetrics[settings.vehicle]
    const surface = this.world.surface(this.x, this.s)
    const traction = tractionAcceleration(settings, surface.onRoad)
    const lateralAcceleration = Math.min(4, traction * 0.6)
    const speed = Math.abs(this.speed)
    const braking = Math.max(
      0.2,
      Math.min(metrics.brake * 0.7, traction * 0.5) -
        Math.max(0, -surface.slopeS * direction) * 9.81,
    )
    const preview = clamp((speed * speed) / (2 * braking) + speed, 80, 1200)
    let limit = Math.abs(targetSpeed)
    for (let distance = 0; distance <= preview; distance += 10) {
      const sample = this.world.road(this.s + direction * distance)
      const before = this.world.road(this.s + direction * distance - 4)
      const after = this.world.road(this.s + direction * distance + 4)
      const curvature =
        Math.abs(angleDifference(after.yaw, before.yaw)) / (8 * Math.hypot(1, sample.dx))
      const cornerSpeedSquared = lateralAcceleration / Math.max(curvature, 0.000001)
      const availableDistance = Math.max(0, distance - speed)
      limit = Math.min(limit, Math.sqrt(cornerSpeedSquared + 2 * braking * availableDistance))
    }
    return direction * limit
  }
  autoInput(targetSpeed: number): Input {
    const requested = clamp(
      targetSpeed,
      -cruiseLimits.reverse,
      Math.max(cruiseLimits.forward, vehicleMetrics[this.world.settings.vehicle].maxSpeed),
    )
    const direction =
      Math.abs(this.speed) > 0.05 ? Math.sign(this.speed) : Math.sign(requested) || 1
    const lookahead = direction * (13 + Math.abs(this.speed) * 0.8)
    const target = this.world.road(this.s + lookahead)
    const targetX = target.x - this.x
    const targetRight = targetX * Math.cos(this.yaw) + lookahead * Math.sin(this.yaw)
    const curvature = (-2 * targetRight) / (targetX * targetX + lookahead * lookahead)
    const metrics = vehicleMetrics[this.world.settings.vehicle]
    const steer =
      Math.atan(metrics.wheelbase * curvature) /
      steeringLimit(this.speed, this.world.settings.vehicle)
    const safeSpeed = this.routeSpeed(requested)
    const settings = this.world.settings
    const surface = this.world.surface(this.x, this.s)
    const totalLoad = metrics.mass * 9.81
    const traction = Math.min(
      tractionAcceleration(settings, surface.onRoad),
      this.suspension.wheels.reduce(
        (sum, wheel) =>
          sum +
          (wheel.contact
            ? (tractionAcceleration(settings, wheel.onRoad) * wheel.load) / totalLoad
            : 0),
        0,
      ),
    )
    return {
      ...cruisePedals(
        this.speed,
        safeSpeed,
        metrics,
        settings.power,
        traction,
        Math.max(
          Math.sqrt(Math.max(0, traction * traction - (this.yawRate * this.speed) ** 2)) * 0.9,
          Math.abs(this.speed) > Math.abs(safeSpeed) + 2 ? traction * 0.5 : 0,
        ),
        surface.onRoad,
        -Math.sin(this.yaw) * surface.slopeX + Math.cos(this.yaw) * surface.slopeS,
        reverseDriveFactor(this.speed, this.driveForce, metrics.jerk),
      ),
      steer: clamp(steer, -1, 1),
      steeringSource: 'automatic',
      handbrake: false,
      boost: false,
    }
  }
  update(dt: number, input: Input, settings: Settings) {
    const vehicle = vehicleMetrics[settings.vehicle]
    if (this.suspension.vehicle !== settings.vehicle) {
      this.suspension.configure(settings.vehicle)
      this.suspension.reset(this)
    }
    const handbrake = input.handbrake && settings.vehicle !== 'motorcycle'
    const previousX = this.x
    const previousS = this.s
    const previousYaw = this.yaw
    const v = Math.abs(this.speed)
    const reverseCommand = input.brake > 0 && input.throttle === 0
    const reversing = reverseCommand && this.speed < directionChangeSpeed
    const forwardBraking =
      input.throttle > 0 && input.brake === 0 && this.speed < -directionChangeSpeed
    const reverseGovernor = reverseDriveFactor(this.speed, this.driveForce, vehicle.jerk)
    const targetForce = reverseCommand
      ? -input.brake * vehicle.reverse * 0.5 * reverseGovernor
      : forwardDriveForce(v, input.throttle, input.boost, vehicle, settings.power)
    this.driveForce += clamp(
      targetForce - this.driveForce,
      -vehicle.jerk * dt * 0.5,
      vehicle.jerk * dt * 0.5,
    )
    const brake = Math.max(
      reversing ? 0 : input.brake,
      forwardBraking ? input.throttle : 0,
      input.regenBrake,
    )
    this.boosting =
      input.boost && input.throttle > 0 && !brake && this.speed >= 0 && v < vehicle.maxSpeed
    this.brakeForce = brake
      ? Math.min(
          vehicle.brake * brake,
          this.brakeForce + (vehicle.brake * dt) / brakeResponseSeconds,
        )
      : 0
    this.steeringControl.update(dt, input.steer, input.steeringSource, this.speed, settings.vehicle)
    this.tireSteeringLimit = Math.atan(
      (vehicle.wheelbase * gripSteeringShare * surfaceGrip(settings, !this.offroad) * 9.81) /
        Math.max(v * v, 1),
    )
    this.suspension.updateSteering(this.steering)
    const acceleration = solveTires(
      dt,
      this,
      this.suspension.wheels,
      settings,
      brake > 0 || targetForce * this.driveForce < 0 ? 0 : this.driveForce,
      this.brakeForce,
      handbrake,
    )
    if (!handbrake) {
      const grounded = this.suspension.wheels.filter((wheel) => wheel.contact)
      const traction = grounded.length
        ? (grounded.reduce((sum, wheel) => sum + surfaceGrip(settings, wheel.onRoad), 0) /
            this.suspension.wheels.length) *
          9.81
        : 0
      this.stability = stabilize(this, traction, vehicle.wheelbase, dt)
    } else this.stability = 0
    this.x += (-Math.sin(this.yaw) * this.speed + Math.cos(this.yaw) * this.lateralSpeed) * dt
    this.s += (Math.cos(this.yaw) * this.speed + Math.sin(this.yaw) * this.lateralSpeed) * dt
    this.distance += Math.hypot(this.speed, this.lateralSpeed) * dt
    const turn = this.yawRate * dt
    const forwardSpeed = this.speed * Math.cos(turn) - this.lateralSpeed * Math.sin(turn)
    this.lateralSpeed = this.lateralSpeed * Math.cos(turn) + this.speed * Math.sin(turn)
    this.speed = forwardSpeed
    this.yaw += turn
    this.impact = damp(this.impact, 0, 5, dt)
    let collision: ReturnType<typeof roadCoordinates> | null = null
    let contacts: BarrierContact[] | null = null
    let penetration = 0
    const railLimit = roadLayout.railOffset - roadLayout.railClearance
    for (const wheel of this.suspension.wheels) {
      const before = roadCoordinates(
        this.world,
        previousX + wheel.localX * Math.cos(previousYaw) - wheel.localS * Math.sin(previousYaw),
        previousS + wheel.localX * Math.sin(previousYaw) + wheel.localS * Math.cos(previousYaw),
      )
      const after = roadCoordinates(
        this.world,
        this.x + wheel.localX * Math.cos(this.yaw) - wheel.localS * Math.sin(this.yaw),
        this.s + wheel.localX * Math.sin(this.yaw) + wheel.localS * Math.cos(this.yaw),
      )
      const excess = Math.abs(after.distance) - railLimit
      if (
        Math.abs(before.distance) < railLimit &&
        excess >= 0 &&
        guardrailAt(this.world, after.s, Math.sign(after.distance))
      ) {
        const side = Math.sign(after.distance)
        contacts ??= []
        contacts.push({
          localX: wheel.localX,
          localS: wheel.localS,
          normalX: side * Math.cos(after.road.yaw),
          normalS: side * Math.sin(after.road.yaw),
        })
        if (excess >= penetration) {
          collision = after
          penetration = excess
        }
      }
    }
    if (collision && contacts) {
      const side = Math.sign(collision.distance)
      const normalX = side * Math.cos(collision.road.yaw),
        normalS = side * Math.sin(collision.road.yaw)
      this.x -= normalX * (penetration + 0.001)
      this.s -= normalS * (penetration + 0.001)
      const approach = resolveBarrierImpulse(this, contacts, vehicle)
      this.impact = Math.max(this.impact, clamp(approach / 8, 0, 1))
    }
    this.suspension.update(dt, this, acceleration.forward, acceleration.lateral, handbrake)
    this.offroad = this.suspension.wheels.some((wheel) => wheel.contact && !wheel.onRoad)
    this.slip =
      this.suspension.wheels.reduce((sum, wheel) => sum + wheel.slip, 0) /
      this.suspension.wheels.length
  }
  telemetry(): Telemetry {
    return {
      speed: this.speed,
      boost: this.boosting,
      distance: this.distance,
      altitude: this.y,
      steering: this.steering,
      slip: this.slip,
      offroad: this.offroad,
      impact: this.impact,
      gear:
        this.speed < -0.1
          ? 'R'
          : this.speed < 0.1
            ? 'N'
            : String(Math.min(6, Math.floor(this.speed / 10) + 1)),
    }
  }
}
