import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createVehicleModel } from './model'
import { defaults } from './world'

test.each(['touring', 'roadster', 'motorcycle', 'bus'] as const)(
  '%s model has valid geometry, preserves lights in bonnet view, and releases its resources',
  (vehicle) => {
    const model = createVehicleModel({ ...defaults, vehicle })
    const light = new THREE.SpotLight()
    model.group.add(light, light.target)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    model.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material)
      const positions = object.geometry.getAttribute('position')
      const normals = object.geometry.getAttribute('normal')
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(
          true,
        )
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4)
      }
    })
    expect(geometries.size).toBeGreaterThan(10)
    const bounds = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3())
    expect(bounds.x).toBeGreaterThan(0.7)
    expect(bounds.x).toBeLessThan(2.5)
    expect(bounds.y).toBeGreaterThan(1.2)
    expect(bounds.z).toBeLessThan(7)
    model.setExteriorVisible(false)
    model.group.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(object.visible).toBe(false)
    })
    expect(light.visible).toBe(true)
    expect(light.target.visible).toBe(true)
    model.setExteriorVisible(true)
    model.group.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(object.visible).toBe(true)
    })
    const disposed = new Set<THREE.BufferGeometry | THREE.Material>()
    for (const resource of [...geometries, ...materials])
      resource.addEventListener('dispose', () => disposed.add(resource))
    model.dispose()
    expect(disposed.size).toBe(geometries.size + materials.size)
    light.dispose()
  },
)
