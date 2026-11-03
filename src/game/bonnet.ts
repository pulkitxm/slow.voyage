import * as THREE from 'three'
import { createBusCabin } from './bus-cabin'
import { createMotorcycleCabin } from './motorcycle-cabin'
import type { Vehicle } from './world'

export function createBonnet(
  vehicle: Vehicle,
  paint: THREE.Material,
  trim: THREE.Material,
  rasterInstruments = false,
) {
  if (vehicle === 'bus') return createBusCabin(trim, rasterInstruments)
  if (vehicle === 'motorcycle') return createMotorcycleCabin(paint, trim, rasterInstruments)
  const group = new THREE.Group()
  group.visible = false
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
  const mesh = new THREE.Mesh(geometry, paint)
  mesh.receiveShadow = true
  group.add(mesh)
  return {
    group,
    materials: [] as THREE.Material[],
    update(_speed: number, _steering: number, _night: boolean) {},
  }
}
