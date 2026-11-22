import type * as THREE from 'three'
import { CarModel } from './car'
import { LoftCarModel } from './loft-car'
import { isLoftVehicle } from './loft-vehicles'
import { MotorcycleModel } from './motorcycle'
import type { ChassisPose, WheelState } from './suspension'
import { clamp, damp, type Settings, type Vehicle } from './world'

export interface VehicleModel {
  group: THREE.Group
  exterior?: THREE.Group
  firstPerson: THREE.Group
  wheels: readonly THREE.Group[]
  body: THREE.MeshStandardMaterial
  headlightPositions: [number, number, number][]
  setExteriorVisible(visible: boolean): void
  update(wheels: readonly WheelState[], braking: boolean, night: boolean, speed: number): void
  dispose(): void
}

export function createVehicleModel(settings: Settings, software = false): VehicleModel {
  if (settings.vehicle === 'motorcycle') return new MotorcycleModel(settings, software)
  if (isLoftVehicle(settings.vehicle)) return new LoftCarModel(settings, software)
  return new CarModel(settings, software)
}

export const vehicleArrival = { duration: 0.55, lift: 0.12, shrink: 0.03, fade: 450 }

export function arrivalPose(elapsed: number) {
  const progress = clamp(elapsed / vehicleArrival.duration, 0, 1)
  const remaining = 1 - progress
  return {
    lift: vehicleArrival.lift * remaining ** 3,
    scale: 1 - vehicleArrival.shrink * remaining ** 3,
  }
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
