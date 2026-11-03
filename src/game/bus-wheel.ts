import * as THREE from 'three'
import { tireDimensions } from './tire-dimensions'
import { createTire } from './tire-shape'

export function createBusWheel(
  sign: number,
  rubber: THREE.Material,
  metal: THREE.Material,
  trim: THREE.Material,
) {
  const group = new THREE.Group()
  group.position.x = -sign * tireDimensions.bus.inset
  const tire = createTire('bus', rubber)
  group.add(tire)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.19, 48, 1, true), metal)
  barrel.rotation.z = Math.PI / 2
  group.add(barrel)
  const backing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 40), trim)
  backing.rotation.z = Math.PI / 2
  backing.position.x = sign * 0.07
  group.add(backing)
  const disc = new THREE.Shape()
  disc.absarc(0, 0, 0.287, 0, Math.PI * 2, false)
  const centerHole = new THREE.Path()
  centerHole.absarc(0, 0, 0.095, 0, Math.PI * 2, true)
  disc.holes.push(centerHole)
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    const hole = new THREE.Path()
    hole.absellipse(
      Math.cos(angle) * 0.226,
      Math.sin(angle) * 0.226,
      0.019,
      0.037,
      0,
      Math.PI * 2,
      true,
      angle - Math.PI / 2,
    )
    disc.holes.push(hole)
  }
  const face = new THREE.Mesh(
    new THREE.ExtrudeGeometry(disc, {
      depth: 0.012,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      bevelSegments: 1,
      curveSegments: 12,
    }),
    metal,
  )
  face.geometry.translate(0, 0, -0.006)
  face.rotation.y = (sign * Math.PI) / 2
  face.position.x = sign * 0.102
  group.add(face)
  const lip = new THREE.Mesh(new THREE.RingGeometry(0.276, 0.307, 48), metal)
  lip.rotation.y = (sign * Math.PI) / 2
  lip.position.x = sign * 0.113
  group.add(lip)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.04, 32), metal)
  hub.rotation.z = (-sign * Math.PI) / 2
  hub.position.x = sign * 0.1
  group.add(hub)
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.016, 6), metal)
    bolt.rotation.z = Math.PI / 2
    bolt.position.set(sign * 0.113, Math.sin(angle) * 0.145, Math.cos(angle) * 0.145)
    group.add(bolt)
  }
  return group
}
