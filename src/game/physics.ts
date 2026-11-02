import { surfaceGrip } from './grip'
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
  brake: number
  steer: number
  steeringSource: SteeringSource | null
  handbrake: boolean
  regenBrake: number
}
export interface Telemetry {
  speed: number
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
  brakeForce = 0
  offroad = false
  suspension: Suspension
  constructor(public world: World) {
    this.suspension = new Suspension(world)
    this.reset()
  }
  get steering() {
    return this.steeringControl.angle
  }
  reset(s = this.s) {
    this.s = s
    this.driveForce = this.brakeForce = 0
    const road = this.world.road(s)
    this.x = road.x + 2
    this.y = road.y
    this.yaw = road.yaw
    this.speed = this.yawRate = this.lateralSpeed = this.verticalSpeed = 0
    this.steeringControl.reset()
    this.suspension.reset(this)
  }
  routeSpeed(targetSpeed: number) {
    const settings = this.world.settings
    const metrics = vehicleMetrics[settings.vehicle]
    const surface = this.world.surface(this.x, this.s)
    const traction = tractionAcceleration(settings, surface.onRoad)
    const lateralAcceleration = Math.min(4, traction * 0.6)
    const speed = Math.abs(this.speed)
    const braking = Math.max(
      0.2,
      Math.min(metrics.brake * 0.7, traction * 0.5) - Math.max(0, -surface.slopeS) * 9.81,
    )
    const preview = clamp((speed * speed) / (2 * braking) + speed, 80, 1200)
    let limit = targetSpeed
    for (let distance = 0; distance <= preview; distance += 10) {
      const sample = this.world.road(this.s + distance)
      const before = this.world.road(this.s + distance - 4)
      const after = this.world.road(this.s + distance + 4)
      const curvature =
        Math.abs(angleDifference(after.yaw, before.yaw)) / (8 * Math.hypot(1, sample.dx))
      const cornerSpeedSquared = lateralAcceleration / Math.max(curvature, 0.000001)
      const availableDistance = Math.max(0, distance - speed)
      limit = Math.min(limit, Math.sqrt(cornerSpeedSquared + 2 * braking * availableDistance))
    }
    return limit
  }
  autoInput(targetSpeed: number): Input {
    const lookahead = 13 + Math.abs(this.speed) * 0.8
    const target = this.world.road(this.s + lookahead)
    const targetX = target.x + 2 - this.x
    const targetRight = targetX * Math.cos(this.yaw) + lookahead * Math.sin(this.yaw)
    const curvature = (-2 * targetRight) / (targetX * targetX + lookahead * lookahead)
    const metrics = vehicleMetrics[this.world.settings.vehicle]
    const steer =
      Math.atan(metrics.wheelbase * curvature) /
      steeringLimit(this.speed, this.world.settings.vehicle)
    const safeSpeed = this.routeSpeed(targetSpeed)
    const settings = this.world.settings
    const surface = this.world.surface(this.x, this.s)
    const nominalLoad = (metrics.mass * 9.81) / this.suspension.wheels.length
    const traction = this.suspension.wheels.reduce(
      (limit, wheel) =>
        Math.min(
          limit,
          wheel.contact
            ? (tractionAcceleration(settings, wheel.onRoad) * wheel.load) / nominalLoad
            : 0,
        ),
      tractionAcceleration(settings, surface.onRoad),
    )
    const speed = Math.abs(this.speed)
    const rolling =
      0.1 + metrics.rollingResistance * speed + (surface.onRoad ? 0 : 1.4 + speed * 0.04)
    const drive =
      metrics.acceleration * settings.power * 0.5 * (1 + Math.max(0, 0.5 * (1 - speed / 27)))
    return {
      throttle: clamp(
        (safeSpeed - this.speed) * 0.5,
        0,
        Math.min(1, (traction * 0.5 + rolling) / drive),
      ),
      brake: clamp(
        (this.speed - safeSpeed) * 0.3,
        0,
        Math.min(1, Math.max(0, traction * 0.5 - rolling) / metrics.brake),
      ),
      steer: clamp(steer, -1, 1),
      steeringSource: 'automatic',
      handbrake: false,
      regenBrake: 0,
    }
  }
  update(dt: number, input: Input, settings: Settings) {
    const vehicle = vehicleMetrics[settings.vehicle]
    if (this.suspension.vehicle !== settings.vehicle) {
      this.suspension.configure(settings.vehicle)
      this.suspension.reset(this)
    }
    const handbrake = input.handbrake && settings.vehicle !== 'motorcycle'
    const road = this.world.road(this.s)
    const offset = this.x - road.x
    const v = Math.abs(this.speed)
    const reversing = input.brake > 0 && input.throttle === 0 && this.speed < directionChangeSpeed
    const forwardBraking =
      input.throttle > 0 && input.brake === 0 && this.speed < -directionChangeSpeed
    const reverseRunout = Math.max(0, -this.driveForce) ** 2 / vehicle.jerk
    const reverseGovernor = clamp((5 + this.speed - reverseRunout) / 0.5, 0, 1)
    const targetForce = reversing
      ? -input.brake * vehicle.reverse * 0.5 * reverseGovernor
      : input.throttle *
        vehicle.acceleration *
        settings.power *
        0.5 *
        (1 + Math.max(0, 0.5 * (1 - v / 27)))
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
    this.brakeForce = brake
      ? Math.min(
          vehicle.brake * brake,
          this.brakeForce + (vehicle.brake * dt) / brakeResponseSeconds,
        )
      : 0
    this.steeringControl.update(dt, input.steer, input.steeringSource, this.speed, settings.vehicle)
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
    this.x += (-Math.sin(this.yaw) * this.speed + Math.cos(this.yaw) * this.lateralSpeed) * dt
    this.s += (Math.cos(this.yaw) * this.speed + Math.sin(this.yaw) * this.lateralSpeed) * dt
    this.distance += Math.hypot(this.speed, this.lateralSpeed) * dt
    const turn = this.yawRate * dt
    const forwardSpeed = this.speed * Math.cos(turn) - this.lateralSpeed * Math.sin(turn)
    this.lateralSpeed = this.lateralSpeed * Math.cos(turn) + this.speed * Math.sin(turn)
    this.speed = forwardSpeed
    this.yaw += turn
    const nextRoad = this.world.road(this.s)
    const nextOffset = this.x - nextRoad.x
    const side = Math.sign(nextOffset)
    const crossedRail = Math.abs(offset) < 5.35 && Math.abs(nextOffset) >= 5.35
    this.impact = damp(this.impact, 0, 5, dt)
    if (crossedRail && this.world.guardrail(this.s, side)) {
      this.x = nextRoad.x + side * 5.3
      const sin = Math.sin(this.yaw),
        cos = Math.cos(this.yaw)
      const normalX = side * Math.cos(nextRoad.yaw),
        normalS = side * Math.sin(nextRoad.yaw)
      let velocityX = -sin * this.speed + cos * this.lateralSpeed
      let velocityS = cos * this.speed + sin * this.lateralSpeed
      const approach = Math.max(0, velocityX * normalX + velocityS * normalS)
      velocityX -= normalX * approach * 1.15
      velocityS -= normalS * approach * 1.15
      this.speed = -sin * velocityX + cos * velocityS
      this.lateralSpeed = cos * velocityX + sin * velocityS
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
