import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createInstrumentMaterials, createSpeedometer } from './instruments'
import { batchUntexturedMeshes } from './mesh-batch'

export function createBusCabin(trim: THREE.Material) {
  const group = new THREE.Group()
  group.visible = false
  const pad = new THREE.MeshStandardMaterial({ color: '#424944', roughness: 0.96 })
  const theme = createInstrumentMaterials()
  const { ring: metal, face } = theme
  const materials = [pad, ...theme.materials]
  const box = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    parent: THREE.Group = group,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.16),
      material,
    )
    mesh.position.set(...position)
    parent.add(mesh)
    return mesh
  }
  box([2.13, 0.29, 0.35], [0, 1.82, -3.17], trim)
  box([2.1, 0.065, 0.38], [0, 1.975, -3.17], pad)
  box([2.04, 0.009, 0.025], [0, 1.995, -3.01], metal)
  box([2.13, 0.88, 0.12], [0, 1.3, -3.07], trim)
  box([2.13, 0.05, 1.78], [0, 0.85, -2.45], face)
  for (const side of [-1, 1]) {
    box([0.08, 1.08, 1.9], [side * 1.085, 1.4, -2.4], trim)
    box([0.11, 0.045, 1.9], [side * 1.075, 1.955, -2.4], pad)
    box([0.09, 0.1, 0.38], [side * 1.075, 1.98, -3.16], pad)
  }
  for (const x of [-0.94, 0.64]) {
    box([0.18, 0.075, 0.015], [x, 1.9, -2.988], face)
    for (let row = 0; row < 4; row++)
      box([0.15, 0.006, 0.012], [x, 1.877 + row * 0.015, -2.976], pad)
  }
  const pod = new THREE.Group()
  pod.position.set(-0.48, 2.045, -3.11)
  pod.rotation.x = -0.3
  group.add(pod)
  box([0.36, 0.23, 0.16], [0, 0, 0], trim, pod)
  box([0.32, 0.195, 0.014], [0, 0, 0.083], face, pod)
  const speedometer = createSpeedometer(0.083, 140, theme)
  speedometer.group.position.z = 0.094
  speedometer.group.rotation.x = Math.PI / 2
  pod.add(speedometer.group)
  box([0.24, 0.09, 0.018], [-0.12, 1.895, -2.978], face)
  for (let i = 0; i < 4; i++) box([0.035, 0.042, 0.012], [-0.2 + i * 0.052, 1.895, -2.962], pad)
  const steeringWheel = new THREE.Group()
  steeringWheel.name = 'steering-wheel'
  steeringWheel.position.set(-0.48, 1.84, -2.8)
  steeringWheel.rotation.x = -0.55
  group.add(steeringWheel)
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 12, 48), trim)
  steeringWheel.add(wheelRim)
  for (const angle of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
    const spoke = box([0.025, 0.16, 0.019], [0, 0, 0], pad, steeringWheel)
    spoke.position.set(Math.sin(angle) * 0.12, Math.cos(angle) * 0.12, 0)
    spoke.rotation.z = -angle
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.035, 24), trim)
  hub.rotation.x = Math.PI / 2
  hub.position.z = 0.006
  steeringWheel.add(hub)
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 16), trim)
  column.rotation.x = Math.PI / 2
  column.position.z = -0.13
  steeringWheel.add(column)
  batchUntexturedMeshes(steeringWheel)
  batchUntexturedMeshes(group, [steeringWheel, speedometer.needle])
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.receiveShadow = true
  })
  return {
    group,
    materials,
    update(speed: number, steering: number, night: boolean) {
      speedometer.update(speed)
      steeringWheel.rotation.z = steering * 5
      theme.setNight(night)
    },
  }
}
