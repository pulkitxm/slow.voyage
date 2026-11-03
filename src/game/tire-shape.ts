import * as THREE from 'three'
import { tireDimensions } from './tire-dimensions'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

export function createTire(vehicle: Vehicle, material: THREE.Material) {
  const shape = tireDimensions[vehicle]
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
