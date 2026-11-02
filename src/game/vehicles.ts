import type { Vehicle } from './world'

export interface VehicleMetrics {
  acceleration: number
  reverse: number
  jerk: number
  brake: number
  drag: number
  rollingResistance: number
  wheelbase: number
  maxSpeed: number
  maxSteering: number
}
export const vehicleMetrics: Record<Vehicle, VehicleMetrics> = {
  touring: {
    acceleration: 9,
    reverse: 5,
    jerk: 48,
    brake: 8,
    drag: 0.001,
    rollingResistance: 0.06,
    wheelbase: 2.75,
    maxSpeed: 45,
    maxSteering: 0.68,
  },
  roadster: {
    acceleration: 11,
    reverse: 5,
    jerk: 48,
    brake: 8,
    drag: 0.001,
    rollingResistance: 0.04,
    wheelbase: 2.4,
    maxSpeed: 53,
    maxSteering: 0.68,
  },
  bus: {
    acceleration: 6,
    reverse: 5,
    jerk: 6,
    brake: 4,
    drag: 0.002,
    rollingResistance: 0.03,
    wheelbase: 5.47,
    maxSpeed: 32,
    maxSteering: 0.65,
  },
}
