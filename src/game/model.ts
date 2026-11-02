import type * as THREE from 'three'
import { CarModel } from './car'
import { MotorcycleModel } from './motorcycle'
import type { WheelState } from './suspension'
import type { Settings } from './world'

export interface VehicleModel {
  group: THREE.Group
  firstPerson: THREE.Group
  body: THREE.MeshStandardMaterial
  headlightPositions: [number, number, number][]
  setExteriorVisible(visible: boolean): void
  update(wheels: readonly WheelState[], braking: boolean, night: boolean, speed: number): void
  dispose(): void
}

export function createVehicleModel(settings: Settings): VehicleModel {
  return settings.vehicle === 'motorcycle' ? new MotorcycleModel(settings) : new CarModel(settings)
}
