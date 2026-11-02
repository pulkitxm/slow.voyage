import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function batchUntexturedMeshes(root: THREE.Group, animated: THREE.Object3D[] = []) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const materials = new Map<THREE.Material, THREE.Mesh[]>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
    let ancestor: THREE.Object3D | null = object
    while (ancestor && ancestor !== root) {
      if (animated.includes(ancestor)) return
      ancestor = ancestor.parent
    }
    const meshes = materials.get(object.material) ?? []
    meshes.push(object)
    materials.set(object.material, meshes)
  })
  const replaced = new Set<THREE.BufferGeometry>()
  for (const [material, meshes] of materials) {
    if (meshes.length < 2) continue
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld))
      for (const attribute of Object.keys(geometry.attributes))
        if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute)
      return geometry
    })
    const merged = mergeGeometries(geometries)
    for (const geometry of geometries) geometry.dispose()
    if (!merged) throw new Error('Vehicle surfaces could not be batched')
    for (const mesh of meshes) {
      replaced.add(mesh.geometry)
      mesh.removeFromParent()
    }
    root.add(new THREE.Mesh(merged, material))
  }
  const retained = new Set<THREE.BufferGeometry>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) retained.add(object.geometry)
  })
  for (const geometry of replaced) if (!retained.has(geometry)) geometry.dispose()
}
