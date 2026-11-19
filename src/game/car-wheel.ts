import * as THREE from 'three'
import { tireDimensions } from './tire-dimensions'
import { createTire } from './tire-shape'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

const reference = { rim: 0.234665, width: 0.1836 }

export function createCarWheel(
  vehicle: Vehicle,
  rubber: THREE.Material,
  metal: THREE.Material,
  trim: THREE.Material,
  spokes = 5,
) {
  const spin = new THREE.Group()
  spin.add(createTire(vehicle, rubber))
  const tire = tireDimensions[vehicle]
  const alloy = new THREE.Group()
  const radial = (vehicleMetrics[vehicle].wheelRadius - tire.tube * 2) / reference.rim
  alloy.scale.set(tire.width / reference.width, radial, radial)
  spin.add(alloy)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.16, 24, 1, true), metal)
  rim.rotation.z = Math.PI / 2
  alloy.add(rim)
  for (const face of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.224, 0.011, 8, 24), metal)
    lip.rotation.y = Math.PI / 2
    lip.position.x = face * 0.085
    alloy.add(lip)
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24), trim)
  disc.rotation.z = Math.PI / 2
  alloy.add(disc)
  const taper = 5 / spokes
  for (let i = 0; i < spokes; i++) {
    const shape = new THREE.Shape()
    shape.moveTo(-0.035 * taper, 0.055)
    shape.lineTo(0.035 * taper, 0.055)
    shape.lineTo(0.1 * taper, 0.222)
    shape.lineTo(-0.055 * taper, 0.222)
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.17,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 1,
    })
    geometry.translate(0, 0, -0.085)
    geometry.rotateY(Math.PI / 2)
    const spoke = new THREE.Mesh(geometry, metal)
    spoke.rotation.x = (i * Math.PI * 2) / spokes
    alloy.add(spoke)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.195, 16), metal)
  hub.rotation.z = Math.PI / 2
  alloy.add(hub)
  return spin
}
