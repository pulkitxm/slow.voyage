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
  mass: number
  suspensionTravel: number
  suspensionDamping: number
  centerOfMassHeight: number
  maxSpeed: number
  maxSteering: number
  steeringSpeed: number
  steeringAcceleration: number
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
    mass: 700,
    suspensionTravel: 0.07,
    suspensionDamping: 0.8,
    centerOfMassHeight: 0.42,
    maxSpeed: 45,
    maxSteering: 0.68,
    steeringSpeed: 1.57,
    steeringAcceleration: 12,
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
    mass: 700,
    suspensionTravel: 0.07,
    suspensionDamping: 0.8,
    centerOfMassHeight: 0.4,
    maxSpeed: 53,
    maxSteering: 0.68,
    steeringSpeed: 1.57,
    steeringAcceleration: 12,
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
    mass: 700,
    suspensionTravel: 0.07,
    suspensionDamping: 0.85,
    centerOfMassHeight: 0.6,
    maxSpeed: 53,
    maxSteering: 0.4,
    steeringSpeed: 1.57,
    steeringAcceleration: 8,
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
    mass: 1400,
    suspensionTravel: 0.16,
    suspensionDamping: 0.85,
    centerOfMassHeight: 1.1,
    maxSpeed: 32,
    maxSteering: 0.65,
    steeringSpeed: 0.45,
    steeringAcceleration: 6,
  },
}
export const vehicleNames: Record<Vehicle, string> = {
  touring: 'Grand tourer',
  roadster: 'Roadster',
  motorcycle: 'Motorcycle',
  bus: 'Wanderer bus',
}
