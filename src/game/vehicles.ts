import type { Vehicle } from './world'

export interface VehicleMetrics {
  acceleration: number
  reverse: number
  jerk: number
  brake: number
  drag: number
  rollingResistance: number
  wheelbase: number
  trackWidth: number
  wheelRadius: number
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
    trackWidth: 1.36,
    wheelRadius: 0.342665,
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
    trackWidth: 1.36,
    wheelRadius: 0.342665,
    maxSpeed: 53,
    maxSteering: 0.68,
  },
  motorcycle: {
    acceleration: 11,
    reverse: 5,
    jerk: 48,
    brake: 8,
    drag: 0.001,
    rollingResistance: 0.04,
    wheelbase: 1.95,
    trackWidth: 0,
    wheelRadius: 0.26,
    maxSpeed: 53,
    maxSteering: 0.4,
  },
  bus: {
    acceleration: 6,
    reverse: 5,
    jerk: 6,
    brake: 4,
    drag: 0.002,
    rollingResistance: 0.03,
    wheelbase: 5.47,
    trackWidth: 2.24,
    wheelRadius: 0.3955,
    maxSpeed: 32,
    maxSteering: 0.65,
  },
}
export const vehicleNames: Record<Vehicle, string> = {
  touring: 'Grand tourer',
  roadster: 'Roadster',
  motorcycle: 'Motorcycle',
  bus: 'Wanderer bus',
}
