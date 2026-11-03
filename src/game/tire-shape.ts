import * as THREE from 'three'
import { busLayout } from './bus-layout'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

const passengerShape = { tube: 0.054, width: 0.1836, radialSegments: 12, tubularSegments: 32 }
const shapes = {
  touring: passengerShape,
  roadster: passengerShape,
  motorcycle: { tube: 0.0385, width: 0.077, radialSegments: 10, tubularSegments: 32 },
  bus: { tube: 0.065, width: busLayout.wheelWidth, radialSegments: 16, tubularSegments: 48 },
} as const

export function createTire(vehicle: Vehicle, material: THREE.Material) {
  const shape = shapes[vehicle]
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(
      vehicleMetrics[vehicle].wheelRadius - shape.tube,
      shape.tube,
      shape.radialSegments,
      shape.tubularSegments,
    ),
    material,
  )
  tire.rotation.y = Math.PI / 2
  tire.scale.z = shape.width / (shape.tube * 2)
  return tire
}
