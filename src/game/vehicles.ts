import type { Vehicle } from './world'

export interface VehicleMetrics {
  acceleration: number
  reverse: number
  reverseSpeed: number
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
  steeringInterval: number
  roadGrip: number
  looseGrip: number
}
export function yawInertia(metrics: VehicleMetrics) {
  return (metrics.mass * ((metrics.wheelbase * 1.5) ** 2 + metrics.trackWidth ** 2)) / 12
}

export const vehicleMetrics: Record<Vehicle, VehicleMetrics> = {
  touring: {
    acceleration: 9,
    reverse: 12,
    reverseSpeed: 12,
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
    steeringInterval: 1,
    roadGrip: 1,
    looseGrip: 1,
  },
  roadster: {
    acceleration: 11,
    reverse: 15,
    reverseSpeed: 14,
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
    steeringInterval: 1,
    roadGrip: 1,
    looseGrip: 1,
  },
  motorcycle: {
    acceleration: 11,
    reverse: 5,
    reverseSpeed: 5,
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
    steeringInterval: 1.8,
    roadGrip: 1,
    looseGrip: 1,
  },
  bus: {
    acceleration: 6,
    reverse: 8,
    reverseSpeed: 4.5,
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
    steeringInterval: 2,
    roadGrip: 1,
    looseGrip: 1,
  },
  pickup: {
    acceleration: 7.5,
    reverse: 10,
    reverseSpeed: 7.5,
    jerk: 30,
    brake: 7,
    drag: 0.0014,
    rollingResistance: 0.06,
    wheelbase: 3.2,
    trackWidth: 1.62,
    wheelRadius: 0.42,
    mass: 1000,
    suspensionTravel: 0.16,
    suspensionDamping: 0.75,
    centerOfMassHeight: 0.68,
    maxSpeed: 38,
    maxSteering: 0.62,
    steeringSpeed: 1.2,
    steeringAcceleration: 9,
    steeringInterval: 1.3,
    roadGrip: 1,
    looseGrip: 1.4,
  },
  hatchback: {
    acceleration: 8,
    reverse: 11,
    reverseSpeed: 10,
    jerk: 48,
    brake: 8.5,
    drag: 0.001,
    rollingResistance: 0.05,
    wheelbase: 2.3,
    trackWidth: 1.38,
    wheelRadius: 0.3,
    mass: 560,
    suspensionTravel: 0.07,
    suspensionDamping: 0.8,
    centerOfMassHeight: 0.42,
    maxSpeed: 40,
    maxSteering: 0.72,
    steeringSpeed: 2,
    steeringAcceleration: 16,
    steeringInterval: 0.8,
    roadGrip: 1,
    looseGrip: 1,
  },
  supercar: {
    acceleration: 16,
    reverse: 21,
    reverseSpeed: 15,
    jerk: 70,
    brake: 12,
    drag: 0.0008,
    rollingResistance: 0.04,
    wheelbase: 2.6,
    trackWidth: 1.62,
    wheelRadius: 0.345,
    mass: 750,
    suspensionTravel: 0.05,
    suspensionDamping: 0.88,
    centerOfMassHeight: 0.32,
    maxSpeed: 70,
    maxSteering: 0.6,
    steeringSpeed: 1.8,
    steeringAcceleration: 14,
    steeringInterval: 0.85,
    roadGrip: 1.3,
    looseGrip: 0.9,
  },
}
export const vehicleNames: Record<Vehicle, string> = {
  touring: 'Grand tourer',
  roadster: 'Roadster',
  motorcycle: 'Motorcycle',
  bus: 'Wanderer bus',
  pickup: 'Trail pickup',
  hatchback: 'City hatchback',
  supercar: 'Supercar',
}
