import { vehicleMetrics } from './vehicles'
import { clamp, type Vehicle, type World } from './world'

export interface ChassisPose {
  x: number
  s: number
  y: number
  yaw: number
  pitch: number
  roll: number
  verticalSpeed: number
  pitchRate: number
  rollRate: number
  speed: number
  lateralSpeed: number
  yawRate: number
  steering: number
}

export interface WheelState {
  localX: number
  localS: number
  front: boolean
  x: number
  s: number
  ground: number
  groundSpeed: number
  slopeX: number
  slopeS: number
  onRoad: boolean
  contact: boolean
  compression: number
  offset: number
  load: number
  steering: number
  rotation: number
  rollingSpeed: number
  lateralSpeed: number
  slip: number
  longitudinalImpulse: number
  lateralImpulse: number
  locked: boolean
}

export class Suspension {
  wheels: WheelState[] = []
  vehicle: Vehicle
  constructor(
    public world: World,
    vehicle = world.settings.vehicle,
  ) {
    this.vehicle = vehicle
    this.configure(vehicle)
  }
  configure(vehicle: Vehicle) {
    this.vehicle = vehicle
    const metrics = vehicleMetrics[vehicle]
    this.wheels = []
    for (const localS of [-metrics.wheelbase * 0.5, metrics.wheelbase * 0.5])
      for (const side of metrics.trackWidth ? [-1, 1] : [0])
        this.wheels.push({
          localX: side * metrics.trackWidth * 0.5,
          localS,
          front: localS > 0,
          x: 0,
          s: 0,
          ground: 0,
          groundSpeed: 0,
          slopeX: 0,
          slopeS: 0,
          onRoad: true,
          contact: true,
          compression: 0.5,
          offset: 0,
          load: (metrics.mass * 9.81) / (metrics.trackWidth ? 4 : 2),
          steering: 0,
          rotation: 0,
          rollingSpeed: 0,
          lateralSpeed: 0,
          slip: 0,
          longitudinalImpulse: 0,
          lateralImpulse: 0,
          locked: false,
        })
  }
  sample(pose: ChassisPose, dt = 0) {
    const sin = Math.sin(pose.yaw),
      cos = Math.cos(pose.yaw)
    for (const wheel of this.wheels) {
      wheel.x = pose.x + wheel.localX * cos - wheel.localS * sin
      wheel.s = pose.s + wheel.localX * sin + wheel.localS * cos
      const surface = this.world.surface(wheel.x, wheel.s)
      wheel.groundSpeed = dt ? (surface.height - wheel.ground) / dt : 0
      wheel.ground = surface.height
      wheel.onRoad = surface.onRoad
      wheel.slopeX = surface.slopeX
      wheel.slopeS = surface.slopeS
    }
  }
  reset(pose: ChassisPose) {
    this.sample(pose)
    const metrics = vehicleMetrics[this.vehicle]
    const front = this.wheels.filter((wheel) => wheel.front),
      rear = this.wheels.filter((wheel) => !wheel.front)
    const mean = (wheels: WheelState[]) =>
      wheels.reduce((sum, wheel) => sum + wheel.ground, 0) / wheels.length
    pose.y = mean(this.wheels)
    pose.pitch = Math.atan2(mean(front) - mean(rear), metrics.wheelbase)
    pose.roll = metrics.trackWidth
      ? Math.atan2(
          mean(this.wheels.filter((wheel) => wheel.localX > 0)) -
            mean(this.wheels.filter((wheel) => wheel.localX < 0)),
          metrics.trackWidth,
        )
      : 0
    pose.verticalSpeed = pose.pitchRate = pose.rollRate = 0
    for (const wheel of this.wheels) {
      wheel.rotation = wheel.rollingSpeed = wheel.lateralSpeed = wheel.slip = 0
      wheel.locked = false
      wheel.load = (metrics.mass * 9.81) / this.wheels.length
    }
    this.updateOffsets(pose)
  }
  gap(pose: ChassisPose, wheel: WheelState) {
    return (
      pose.y +
      wheel.localS * Math.sin(pose.pitch) +
      wheel.localX * Math.sin(pose.roll) * Math.cos(pose.pitch) -
      wheel.ground
    )
  }
  updateOffsets(pose: ChassisPose) {
    const travel = vehicleMetrics[this.vehicle].suspensionTravel
    for (const wheel of this.wheels) {
      const gap = this.gap(pose, wheel)
      wheel.offset = clamp(-gap, -travel, travel)
      wheel.compression = clamp((travel - gap) / (2 * travel), 0, 1)
      wheel.contact = gap < travel
    }
  }
  updateSteering(steering: number) {
    const metrics = vehicleMetrics[this.vehicle]
    const radius = Math.abs(steering) < 0.0001 ? Infinity : metrics.wheelbase / Math.tan(steering)
    for (const wheel of this.wheels)
      wheel.steering = wheel.front ? Math.atan(metrics.wheelbase / (radius + wheel.localX)) : 0
  }
  update(
    dt: number,
    pose: ChassisPose,
    forwardAcceleration: number,
    lateralAcceleration: number,
    handbrake: boolean,
  ) {
    const metrics = vehicleMetrics[this.vehicle]
    const quarterMass = metrics.mass / this.wheels.length
    const spring = (quarterMass * 9.81) / metrics.suspensionTravel
    const damper = 2 * metrics.suspensionDamping * Math.sqrt(spring * quarterMass)
    this.sample(pose, dt)
    let verticalForce = -metrics.mass * 9.81
    let pitchTorque = metrics.mass * forwardAcceleration * metrics.centerOfMassHeight
    let rollTorque = metrics.trackWidth
      ? metrics.mass * lateralAcceleration * metrics.centerOfMassHeight
      : 0
    for (const wheel of this.wheels) {
      const compression = metrics.suspensionTravel - this.gap(pose, wheel)
      const mountSpeed =
        pose.verticalSpeed +
        wheel.localS * pose.pitchRate +
        wheel.localX * pose.rollRate -
        wheel.groundSpeed
      const bumpStop = Math.max(0, compression - 2 * metrics.suspensionTravel) * spring * 4
      wheel.load =
        compression > 0
          ? clamp(spring * compression - damper * mountSpeed + bumpStop, 0, quarterMass * 9.81 * 8)
          : 0
      verticalForce += wheel.load
      pitchTorque += wheel.load * wheel.localS
      rollTorque += wheel.load * wheel.localX
    }
    const pitchInertia = (metrics.mass * (metrics.wheelbase * 1.5) ** 2) / 12
    const rollInertia =
      metrics.mass * ((metrics.trackWidth * 1.25) ** 2 / 12 + metrics.centerOfMassHeight ** 2)
    pose.verticalSpeed += (verticalForce / metrics.mass) * dt
    pose.pitchRate += (pitchTorque / pitchInertia) * dt
    pose.rollRate += metrics.trackWidth ? (rollTorque / rollInertia) * dt : 0
    pose.y += pose.verticalSpeed * dt
    pose.pitch = clamp(pose.pitch + pose.pitchRate * dt, -1.1, 1.1)
    pose.roll = clamp(pose.roll + pose.rollRate * dt, -0.8, 0.8)
    let penetration = 0
    for (const wheel of this.wheels)
      penetration = Math.max(penetration, -metrics.suspensionTravel - this.gap(pose, wheel))
    if (penetration > 0) {
      pose.y += penetration
      pose.verticalSpeed = Math.max(0, pose.verticalSpeed)
    }
    this.updateOffsets(pose)
    this.updateSteering(pose.steering)
    for (const wheel of this.wheels) {
      const rightSpeed = pose.lateralSpeed - pose.yawRate * wheel.localS
      const forwardSpeed = pose.speed + pose.yawRate * wheel.localX
      if (wheel.contact) {
        wheel.rollingSpeed =
          forwardSpeed * Math.cos(wheel.steering) - rightSpeed * Math.sin(wheel.steering)
        wheel.lateralSpeed =
          rightSpeed * Math.cos(wheel.steering) + forwardSpeed * Math.sin(wheel.steering)
      }
      if (!wheel.locked && !(handbrake && !wheel.front))
        wheel.rotation -= (wheel.rollingSpeed * dt) / metrics.wheelRadius
    }
  }
}
