import type * as THREE from 'three'
import { CarModel } from './car'
import { MotorcycleModel } from './motorcycle'
import type { ChassisPose, WheelState } from './suspension'
import { clamp, damp, type Settings, type Vehicle } from './world'

export interface VehicleModel {
  group: THREE.Group
  firstPerson: THREE.Group
  wheels: readonly THREE.Group[]
  body: THREE.MeshStandardMaterial
  headlightPositions: [number, number, number][]
  setExteriorVisible(visible: boolean): void
  update(wheels: readonly WheelState[], braking: boolean, night: boolean, speed: number): void
  dispose(): void
}

export function createVehicleModel(settings: Settings, software = false): VehicleModel {
  return settings.vehicle === 'motorcycle'
    ? new MotorcycleModel(settings, software)
    : new CarModel(settings, software)
}

export function positionVehicle(
  model: VehicleModel,
  pose: ChassisPose,
  vehicle: Vehicle,
  dt: number,
) {
  model.group.position.set(pose.x, pose.y, -pose.s)
  model.group.rotation.order = 'YXZ'
  model.group.rotation.y = pose.yaw
  model.group.rotation.x = pose.pitch
  model.group.rotation.z =
    vehicle === 'motorcycle'
      ? damp(
          model.group.rotation.z,
          clamp(Math.atan((pose.yawRate * pose.speed) / 9.81), -0.65, 0.65),
          5,
          dt,
        )
      : pose.roll
}
