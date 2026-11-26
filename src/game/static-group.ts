import * as THREE from 'three'

export class StaticGroup extends THREE.Group {
  override matrixAutoUpdate = false
  override updateMatrixWorld() {}
  override updateWorldMatrix() {}
}
