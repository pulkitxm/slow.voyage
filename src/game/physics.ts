import { Suspension } from './suspension'
import { solveTires } from './tires'
import { vehicleMetrics } from './vehicles'
import { angleDifference, clamp, damp, type Settings, type World } from './world'

export interface Input {
  throttle: number
  brake: number
  steer: number
  handbrake: boolean
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
function steeringLimit(speed: number, settings: Settings) {
  const metrics = vehicleMetrics[settings.vehicle]
  return metrics.maxSteering * (1 - 0.75 * clamp(Math.abs(speed) / metrics.maxSpeed, 0, 1))
}
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
  steering = 0
  steeringRate = 0
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
  input: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false }
  constructor(public world: World) {
    this.suspension = new Suspension(world)
    this.reset()
  }
  reset(s = this.s) {
    this.s = s
    this.driveForce = this.brakeForce = 0
    const road = this.world.road(s)
    this.x = road.x + 2
    this.y = road.y
    this.yaw = road.yaw
    this.speed = this.steering = this.yawRate = this.lateralSpeed = this.verticalSpeed = 0
    this.steeringRate = 0
    this.suspension.reset(this)
  }
  autoInput(targetSpeed: number): Input {
    const lookahead = 13 + Math.abs(this.speed) * 0.8
    const target = this.world.road(this.s + lookahead)
    const targetX = target.x + 2 - this.x
    const targetRight = targetX * Math.cos(this.yaw) + lookahead * Math.sin(this.yaw)
    const curvature = (-2 * targetRight) / (targetX * targetX + lookahead * lookahead)
    const metrics = vehicleMetrics[this.world.settings.vehicle]
    const steer =
      Math.atan(metrics.wheelbase * curvature) / steeringLimit(this.speed, this.world.settings)
    const bend = Math.abs(
      angleDifference(this.world.road(this.s + 65).yaw, this.world.road(this.s).yaw),
    )
    const safeSpeed = Math.min(targetSpeed, 16 + 6 / (bend + 0.1))
    return {
      throttle: clamp((safeSpeed - this.speed) * 0.5, 0, 1),
      brake: clamp((this.speed - safeSpeed) * 0.3, 0, 1),
      steer: clamp(steer, -1, 1),
      handbrake: false,
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
    const reversing = input.brake > 0 && input.throttle === 0 && this.speed < 0.4
    const targetForce = reversing
      ? -input.brake * vehicle.reverse * 0.5
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
    this.brakeForce =
      input.brake && !reversing
        ? Math.min(vehicle.brake * input.brake, this.brakeForce + vehicle.brake * 4 * dt)
        : 0
    const steeringError = input.steer * steeringLimit(this.speed, settings) - this.steering
    const desiredSteeringRate = clamp(
      steeringError * 7,
      -vehicle.steeringSpeed,
      vehicle.steeringSpeed,
    )
    this.steeringRate += clamp(
      desiredSteeringRate - this.steeringRate,
      -vehicle.steeringAcceleration * dt,
      vehicle.steeringAcceleration * dt,
    )
    const steeringStep = this.steeringRate * dt
    if (
      Math.sign(steeringStep) === Math.sign(steeringError) &&
      Math.abs(steeringStep) >= Math.abs(steeringError)
    ) {
      this.steering += steeringError
      this.steeringRate = 0
    } else this.steering += steeringStep
    this.suspension.updateSteering(this.steering)
    const acceleration = solveTires(
      dt,
      this,
      this.suspension.wheels,
      settings,
      this.driveForce,
      this.brakeForce,
      handbrake,
    )
    this.x += (-Math.sin(this.yaw) * this.speed + Math.cos(this.yaw) * this.lateralSpeed) * dt
    this.s += (Math.cos(this.yaw) * this.speed + Math.sin(this.yaw) * this.lateralSpeed) * dt
    this.distance += Math.hypot(this.speed, this.lateralSpeed) * dt
    const turn = this.yawRate * dt
    const forwardSpeed = this.speed * Math.cos(turn) - this.lateralSpeed * Math.sin(turn)
    this.lateralSpeed = this.lateralSpeed * Math.cos(turn) + this.speed * Math.sin(turn)
    this.speed = clamp(forwardSpeed, -5, 110)
    this.yaw += turn
    const nextRoad = this.world.road(this.s)
    const nextOffset = this.x - nextRoad.x
    const side = Math.sign(nextOffset)
    const crossedRail = Math.abs(offset) < 5.35 && Math.abs(nextOffset) >= 5.35
    this.impact = damp(this.impact, 0, 5, dt)
    if (crossedRail && this.world.guardrail(this.s, side)) {
      this.x = nextRoad.x + side * 5.3
      this.speed *= 0.66
      this.yaw = damp(this.yaw, nextRoad.yaw, 8, dt)
      this.lateralSpeed = -side * 1.2
      this.impact = 1
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
