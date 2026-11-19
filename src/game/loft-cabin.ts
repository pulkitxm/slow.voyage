import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createInstrumentMaterials, createSpeedometer } from './instruments'
import { loftSampler } from './loft-body'
import type { LoftVehicle } from './loft-vehicles'
import { batchUntexturedMeshes } from './mesh-batch'

function bonnetGeometry(paint: THREE.BufferGeometry, cowl: number) {
  const positions = paint.getAttribute('position'),
    normals = paint.getAttribute('normal')
  const kept: number[] = [],
    keptNormals: number[] = []
  for (let i = 0; i < positions.count; i += 3) {
    if (Math.max(positions.getZ(i), positions.getZ(i + 1), positions.getZ(i + 2)) > cowl) continue
    for (let corner = i; corner < i + 3; corner++) {
      kept.push(positions.getX(corner), positions.getY(corner), positions.getZ(corner))
      keptNormals.push(normals.getX(corner), normals.getY(corner), normals.getZ(corner))
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(keptNormals, 3))
  return geometry
}

export function createLoftCabin(
  spec: LoftVehicle,
  maximumKmH: number,
  bodyPaint: THREE.BufferGeometry,
  paint: THREE.Material,
  trim: THREE.Material,
  rasterInstruments = false,
) {
  const group = new THREE.Group()
  group.visible = false
  group.add(new THREE.Mesh(bonnetGeometry(bodyPaint, spec.cowl), paint))
  const pad = new THREE.MeshStandardMaterial({ color: '#3b403d', roughness: 0.96 })
  const theme = createInstrumentMaterials()
  const box = (
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    parent: THREE.Group = group,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.2),
      material,
    )
    mesh.position.set(...position)
    parent.add(mesh)
    return mesh
  }
  const { seat, dash } = spec
  const sample = loftSampler(spec.body.stations)
  const cowl = sample(spec.cowl)
  const top = cowl.top + Math.max(cowl.crown, 0) + 0.006
  const front = spec.cowl - 0.03
  const back = seat.z - dash.reach + 0.14
  const width = cowl.half * 2 - 0.08
  box([width, 0.1, back - front], [0, top - 0.05, (front + back) / 2], pad)
  box([width, 0.5, 0.1], [0, top - 0.33, back - 0.04], trim)
  const shoulder = sample(seat.z)
  for (const side of [-1, 1])
    box(
      [0.12, 0.5, seat.z + 0.4 - front],
      [side * (shoulder.half - 0.09), shoulder.belt - 0.25, (seat.z + 0.4 + front) / 2],
      trim,
    )
  const pod = new THREE.Group()
  pod.position.set(seat.x, top + 0.03, seat.z - dash.reach)
  pod.rotation.x = -0.3
  group.add(pod)
  box([0.28, 0.14, 0.12], [0, 0, 0], trim, pod)
  box([0.25, 0.115, 0.012], [0, 0, 0.058], theme.face, pod)
  const speedometer = createSpeedometer(0.05, maximumKmH, theme, rasterInstruments)
  speedometer.group.position.z = 0.067
  speedometer.group.rotation.x = Math.PI / 2
  pod.add(speedometer.group)
  const steeringWheel = new THREE.Group()
  steeringWheel.name = 'steering-wheel'
  steeringWheel.position.set(seat.x, top - 0.12, seat.z - dash.reach + 0.2)
  steeringWheel.rotation.x = -0.4
  group.add(steeringWheel)
  steeringWheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.015, 10, 40), trim))
  for (const angle of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
    const spoke = box([0.03, 0.15, 0.016], [0, 0, 0], pad, steeringWheel)
    spoke.position.set(Math.sin(angle) * 0.09, Math.cos(angle) * 0.09, 0)
    spoke.rotation.z = -angle
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.03, 20), trim)
  hub.rotation.x = Math.PI / 2
  hub.position.z = 0.005
  steeringWheel.add(hub)
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.2, 14), trim)
  column.rotation.x = Math.PI / 2
  column.position.z = -0.115
  steeringWheel.add(column)
  batchUntexturedMeshes(steeringWheel)
  batchUntexturedMeshes(group, [
    steeringWheel,
    speedometer.needle,
    ...(speedometer.overlay ? [speedometer.overlay] : []),
  ])
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.receiveShadow = true
  })
  return {
    group,
    materials: [pad, ...theme.materials],
    update(speed: number, steering: number, night: boolean) {
      speedometer.update(speed)
      steeringWheel.rotation.z = steering * 2.2
      theme.setNight(night)
    },
  }
}
