import { tireDimensions } from './tire-dimensions'
import { vehicleMetrics } from './vehicles'
import { clamp, type Vehicle, type World } from './world'

const tireSupportAngles = [-0.7, -0.4, -0.18, 0, 0.18, 0.4, 0.7]
const tireSupportWidths = [-0.95, 0, 0.95]
const tireSupportIterations = 3
const tireSupportRefinements = 3
const supportBase = new Float64Array(tireSupportAngles.length * tireSupportWidths.length * 3)
const supportEstimate = new Float64Array(tireSupportAngles.length * tireSupportWidths.length)

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
    const metrics = vehicleMetrics[this.vehicle]
    const tire = tireDimensions[this.vehicle]
    const sy = Math.sin(pose.yaw),
      cy = Math.cos(pose.yaw),
      sp = Math.sin(pose.pitch),
      cp = Math.cos(pose.pitch),
      sr = Math.sin(pose.roll),
      cr = Math.cos(pose.roll)
    const rightX = cy * cr + sy * sp * sr,
      rightY = cp * sr,
      rightZ = -sy * cr + cy * sp * sr
    const upX = -cy * sr + sy * sp * cr,
      upY = cp * cr,
      upZ = sy * sr + cy * sp * cr
    const backX = sy * cp,
      backY = -sp,
      backZ = cy * cp
    const hub = metrics.wheelRadius - tire.tube
    const halfWidth = tire.width / 2
    for (const wheel of this.wheels) {
      const side = Math.sign(wheel.localX)
      const steerSin = Math.sin(wheel.steering),
        steerCos = Math.cos(wheel.steering)
      const start = clamp(wheel.ground - this.mountHeight(pose, wheel), -0.5, 0.5)
      const centerX = wheel.x + start * upX,
        centerS = wheel.s - start * upZ
      const edgeX = (halfWidth + tire.inset) * steerCos * rightX,
        edgeS = (halfWidth + tire.inset) * steerCos * rightZ
      const pavement =
        this.world.surface(centerX + edgeX, centerS - edgeS).onRoad &&
        this.world.surface(centerX - edgeX, centerS + edgeS).onRoad
          ? this.world.surface(centerX, centerS)
          : null
      let sample = 0
      for (const across of tireSupportWidths) {
        const axle = across * halfWidth - side * tire.inset
        const radius = hub + tire.tube * Math.sqrt(1 - across * across)
        for (const angle of tireSupportAngles) {
          const forward = radius * Math.sin(angle)
          const localX = wheel.localX + axle * steerCos - forward * steerSin
          const localY = metrics.wheelRadius - radius * Math.cos(angle)
          const localZ = -wheel.localS - axle * steerSin - forward * steerCos
          const baseX = pose.x + localX * rightX + localY * upX + localZ * backX
          const baseY = pose.y + localX * rightY + localY * upY + localZ * backY
          const baseS = pose.s - (localX * rightZ + localY * upZ + localZ * backZ)
          const pointX = baseX + start * upX,
            pointS = baseS - start * upZ
          const surface = pavement ?? this.world.surface(pointX, pointS)
          const height = pavement
            ? pavement.height +
              pavement.slopeX * (pointX - centerX) +
              pavement.slopeS * (pointS - centerS)
            : surface.height
          const rate = Math.max(0.2, upY - surface.slopeX * upX + surface.slopeS * upZ)
          supportBase[sample * 3] = baseX
          supportBase[sample * 3 + 1] = baseY
          supportBase[sample * 3 + 2] = baseS
          supportEstimate[sample] = start - (baseY + start * upY - height) / rate
          sample++
        }
      }
      let offset = -Infinity
      let governing: ReturnType<World['surface']> | null = null
      let contactX = 0,
        contactS = 0
      for (let candidate = 0; candidate < (pavement ? 1 : tireSupportRefinements); candidate++) {
        let best = -1
        for (let index = 0; index < sample; index++)
          if (best < 0 || (supportEstimate[index] ?? 0) > (supportEstimate[best] ?? 0)) best = index
        const baseX = supportBase[best * 3] ?? 0,
          baseY = supportBase[best * 3 + 1] ?? 0,
          baseS = supportBase[best * 3 + 2] ?? 0
        let travel = supportEstimate[best] ?? 0
        supportEstimate[best] = -Infinity
        let surface = this.world.surface(baseX + travel * upX, baseS - travel * upZ)
        for (let iteration = 0; iteration < tireSupportIterations; iteration++) {
          const rate = Math.max(0.2, upY - surface.slopeX * upX + surface.slopeS * upZ)
          const next = travel - (baseY + travel * upY - surface.height) / rate
          if (Math.abs(next - travel) < 0.00001) break
          travel = next
          surface = this.world.surface(baseX + travel * upX, baseS - travel * upZ)
        }
        if (travel > offset) {
          offset = travel
          governing = surface
          contactX = baseX + travel * upX
          contactS = baseS - travel * upZ
        }
      }
      if (!governing) continue
      const ground = this.mountHeight(pose, wheel) + offset
      wheel.groundSpeed = dt ? (ground - wheel.ground) / dt : 0
      wheel.ground = ground
      wheel.x = contactX
      wheel.s = contactS
      wheel.onRoad = governing.onRoad
      wheel.slopeX = governing.slopeX
      wheel.slopeS = governing.slopeS
    }
  }
  reset(pose: ChassisPose) {
    const metrics = vehicleMetrics[this.vehicle]
    const front = this.wheels.filter((wheel) => wheel.front),
      rear = this.wheels.filter((wheel) => !wheel.front)
    const mean = (wheels: WheelState[]) =>
      wheels.reduce((sum, wheel) => sum + wheel.ground, 0) / wheels.length
    for (let iteration = 0; iteration < 4; iteration++) {
      this.sample(pose)
      pose.y = mean(this.wheels)
      pose.pitch = Math.atan2(mean(front) - mean(rear), metrics.wheelbase)
      pose.roll = metrics.trackWidth
        ? Math.atan2(
            mean(this.wheels.filter((wheel) => wheel.localX > 0)) -
              mean(this.wheels.filter((wheel) => wheel.localX < 0)),
            metrics.trackWidth,
          )
        : 0
    }
    for (let iteration = 0; iteration < 4; iteration++) {
      this.sample(pose)
      let penetration = 0
      for (const wheel of this.wheels)
        penetration = Math.max(penetration, -metrics.suspensionTravel - this.gap(pose, wheel))
      if (penetration < 0.0005) break
      pose.y += penetration
    }
    pose.verticalSpeed = pose.pitchRate = pose.rollRate = 0
    for (const wheel of this.wheels) {
      wheel.rotation = wheel.rollingSpeed = wheel.lateralSpeed = wheel.slip = 0
      wheel.locked = false
      wheel.load = (metrics.mass * 9.81) / this.wheels.length
    }
    this.updateOffsets(pose)
  }
  mountHeight(pose: ChassisPose, wheel: WheelState) {
    return (
      pose.y +
      wheel.localS * Math.sin(pose.pitch) +
      wheel.localX * Math.sin(pose.roll) * Math.cos(pose.pitch)
    )
  }
  gap(pose: ChassisPose, wheel: WheelState) {
    return this.mountHeight(pose, wheel) - wheel.ground
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
