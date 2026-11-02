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
const vehicles = {
  touring: { acceleration: 6.2, drag: 0.0021, wheelbase: 2.7, maxSpeed: 58 },
  roadster: { acceleration: 8.4, drag: 0.00165, wheelbase: 2.4, maxSpeed: 73 },
  bus: { acceleration: 3.2, drag: 0.0034, wheelbase: 4.4, maxSpeed: 37 },
}
export class CarPhysics {
  x = 0
  s = 180
  y = 0
  yaw = 0
  speed = 0
  steering = 0
  yawRate = 0
  lateralSpeed = 0
  verticalSpeed = 0
  distance = 0
  slip = 0
  impact = 0
  offroad = false
  input: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false }
  constructor(public world: World) {
    this.reset()
  }
  reset(s = this.s) {
    this.s = s
    const road = this.world.road(s)
    this.x = road.x + 2
    this.y = road.y
    this.yaw = road.yaw
    this.speed = this.steering = this.yawRate = this.lateralSpeed = this.verticalSpeed = 0
  }
  autoInput(targetSpeed: number): Input {
    const lookahead = 13 + Math.abs(this.speed) * 0.8
    const target = this.world.road(this.s + lookahead)
    const desiredYaw = Math.atan2(-(target.x + 2 - this.x), lookahead)
    const error = angleDifference(desiredYaw, this.yaw)
    const bend = Math.abs(
      angleDifference(this.world.road(this.s + 65).yaw, this.world.road(this.s).yaw),
    )
    const safeSpeed = Math.min(targetSpeed, 16 + 6 / (bend + 0.1))
    return {
      throttle: clamp((safeSpeed - this.speed) * 0.5, 0, 1),
      brake: clamp((this.speed - safeSpeed) * 0.3, 0, 1),
      steer: clamp(error * 4.5 - this.yawRate * 0.3, -1, 1),
      handbrake: false,
    }
  }
  update(dt: number, input: Input, settings: Settings) {
    const vehicle = vehicles[settings.vehicle]
    const road = this.world.road(this.s)
    const offset = this.x - road.x
    this.offroad = Math.abs(offset) > 4.6
    const v = Math.abs(this.speed)
    const rolling = this.offroad ? 1.4 + v * 0.04 : 0.18
    const gravity = -9.81 * road.dy * Math.cos(angleDifference(this.yaw, road.yaw))
    const throttle = (input.throttle * vehicle.acceleration * settings.power) / (1 + v / 35)
    const braking = input.brake * 10.5 + (input.handbrake ? 5 : 0)
    const resistance = rolling + vehicle.drag * v * v + braking
    const direction = Math.sign(this.speed || input.throttle || -input.brake)
    if (this.speed > 0.4 || input.throttle > 0) {
      this.speed += (throttle + gravity - resistance * direction) * dt
      if (this.speed < 0 && !input.throttle) this.speed = 0
    } else if (input.brake > 0 && input.throttle === 0) {
      this.speed = Math.max(-7, this.speed - vehicle.acceleration * 0.35 * dt)
    } else {
      this.speed = damp(this.speed, 0, 5, dt)
    }
    this.speed = clamp(this.speed, -7, vehicle.maxSpeed * settings.power)
    const maxSteering = 0.53 / (1 + v / 28)
    this.steering = damp(this.steering, input.steer * maxSteering, 7, dt)
    const targetYaw = (this.speed / vehicle.wheelbase) * Math.tan(this.steering)
    const grip =
      settings.grip *
      (settings.season === 'winter' ? 0.58 : 1) *
      (this.offroad ? 0.64 : 1) *
      (input.handbrake ? 0.38 : 1)
    const maxYaw = (grip * 9.81) / Math.max(v, 3)
    this.yawRate = damp(this.yawRate, clamp(targetYaw, -maxYaw, maxYaw), 7 * grip, dt)
    this.yaw += this.yawRate * dt
    this.slip = Math.max(0, Math.abs(targetYaw) - maxYaw)
    this.lateralSpeed = damp(
      this.lateralSpeed,
      -Math.sign(targetYaw) * this.slip * v * 0.9,
      3 * grip,
      dt,
    )
    this.x += (-Math.sin(this.yaw) * this.speed + Math.cos(this.yaw) * this.lateralSpeed) * dt
    this.s += (Math.cos(this.yaw) * this.speed + Math.sin(this.yaw) * this.lateralSpeed) * dt
    this.distance += Math.abs(this.speed) * dt
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
    const ground = this.world.height(this.x, this.s) + 0.16
    if (this.y <= ground + 0.08) {
      this.y = ground
      this.verticalSpeed = 0
    } else {
      this.verticalSpeed -= 9.81 * dt
      this.y = Math.max(ground, this.y + this.verticalSpeed * dt)
    }
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
