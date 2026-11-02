import * as THREE from 'three'
import type { Vehicle } from './world'

export function createBonnet(vehicle: Vehicle, paint: THREE.Material, trim: THREE.Material) {
  const group = new THREE.Group()
  group.visible = false
  let steeringWheel: THREE.Mesh | null = null
  let speedNeedle: THREE.Group | null = null
  const box = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...position)
    group.add(mesh)
  }
  const speedometer = (x: number, y: number, z: number, radius: number) => {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.006, 32), trim)
    face.position.set(x, y, z)
    group.add(face)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.04, 6, 32), paint)
    rim.rotation.x = Math.PI / 2
    rim.position.set(x, y + 0.004, z)
    group.add(rim)
    for (let i = 0; i < 11; i++) {
      const angle = (-2 / 3 + ((i / 10) * 4) / 3) * Math.PI
      const mark = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.05, 0.002, radius * 0.17), paint)
      mark.position.set(
        x + Math.sin(angle) * radius * 0.8,
        y + 0.006,
        z - Math.cos(angle) * radius * 0.8,
      )
      mark.rotation.y = -angle
      group.add(mark)
    }
    speedNeedle = new THREE.Group()
    speedNeedle.name = 'speed-needle'
    speedNeedle.position.set(x, y + 0.008, z)
    const pointer = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.055, 0.003, radius * 0.7),
      paint,
    )
    pointer.position.z = -radius * 0.25
    speedNeedle.add(pointer)
    group.add(speedNeedle)
  }
  if (vehicle === 'bus') {
    box([2.12, 0.16, 0.45], [0, 2, -3.03], trim)
    steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 32), trim)
    steeringWheel.name = 'steering-wheel'
    steeringWheel.position.set(-0.28, 2.04, -2.95)
    steeringWheel.rotation.x = -0.45
    for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.17, 0.014), trim)
      spoke.position.set(-Math.sin(angle) * 0.07, Math.cos(angle) * 0.07, 0)
      spoke.rotation.z = angle
      steeringWheel.add(spoke)
    }
    group.add(steeringWheel)
    box([0.23, 0.11, 0.22], [0.02, 2.145, -3.04], trim)
    speedometer(0.02, 2.205, -3.04, 0.075)
  } else if (vehicle === 'motorcycle') {
    const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 4, 16), trim)
    cowl.rotation.z = Math.PI / 2
    cowl.position.set(0, 0.9, -1.1)
    group.add(cowl)
    box([0.36, 0.02, 0.11], [0, 0.86, -1.16], paint)
    speedometer(0, 0.945, -1.1, 0.064)
  } else {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.69, 0.89, -0.84, 0.69, 0.89, -0.84, -0.73, 0.87, -1.75, 0.73, 0.87, -1.75, -0.65, 0.83,
          -2.02, 0.65, 0.83, -2.02, -0.65, 0.78, -2.02, 0.65, 0.78, -2.02,
        ],
        3,
      ),
    )
    geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6, 5, 7, 6])
    geometry.computeVertexNormals()
    group.add(new THREE.Mesh(geometry, paint))
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.receiveShadow = true
  })
  return {
    group,
    update(speed: number, steering: number) {
      if (speedNeedle)
        speedNeedle.rotation.y = (2 / 3 - (Math.min(Math.abs(speed) / 70, 1) * 4) / 3) * Math.PI
      if (steeringWheel) steeringWheel.rotation.z = steering * 5
    },
  }
}
