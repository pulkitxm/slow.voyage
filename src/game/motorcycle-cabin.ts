import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createInstrumentMaterials, createSpeedometer } from './instruments'
import { batchUntexturedMeshes } from './mesh-batch'

export function createMotorcycleCabin(
  paint: THREE.Material,
  trim: THREE.Material,
  rasterInstruments = false,
) {
  const group = new THREE.Group()
  group.visible = false
  const theme = createInstrumentMaterials()
  const cowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    paint,
  )
  cowl.scale.set(1, 0.55, 1.8)
  cowl.position.set(0, 0.73, -1.12)
  group.add(cowl)
  const pod = new THREE.Group()
  pod.position.set(0, 0.86, -1.13)
  pod.rotation.x = -0.4
  group.add(pod)
  const housing = new THREE.Mesh(new RoundedBoxGeometry(0.23, 0.16, 0.1, 2, 0.018), trim)
  pod.add(housing)
  const speedometer = createSpeedometer(0.064, 220, theme, rasterInstruments)
  speedometer.group.position.z = 0.058
  speedometer.group.rotation.x = Math.PI / 2
  pod.add(speedometer.group)
  batchUntexturedMeshes(group, [
    speedometer.needle,
    ...(speedometer.overlay ? [speedometer.overlay] : []),
  ])
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.receiveShadow = true
  })
  return {
    group,
    materials: theme.materials,
    update(speed: number, _steering: number, night: boolean) {
      speedometer.update(speed)
      theme.setNight(night)
    },
  }
}
