import * as THREE from 'three'

export const probeDetail = { size: 256, near: 0.4, far: 1400, lift: 1.05 }

export function probeFace(frame: number, cadence: number) {
  return frame % cadence === 0 ? Math.floor(frame / cadence) % 6 : -1
}

export class ReflectionProbe {
  target: THREE.WebGLCubeRenderTarget
  rig: THREE.CubeCamera
  ready = false
  private frame = 0
  private drawn = 0
  constructor(size = probeDetail.size) {
    this.target = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    })
    this.rig = new THREE.CubeCamera(probeDetail.near, probeDetail.far, this.target)
  }
  get texture() {
    return this.target.texture
  }
  update(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    centre: THREE.Vector3,
    hidden: readonly THREE.Object3D[],
    cadence = 1,
  ) {
    const face = probeFace(this.frame++, cadence)
    if (face < 0) return
    const rig = this.rig
    if (face === 0 || !this.drawn) {
      rig.position.copy(centre)
      rig.position.y += probeDetail.lift
      if (rig.coordinateSystem !== renderer.coordinateSystem) {
        rig.coordinateSystem = renderer.coordinateSystem
        rig.updateCoordinateSystem()
      }
      rig.updateMatrixWorld(true)
    }
    const camera = rig.children[face]
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    const shown = hidden.map((object) => object.visible)
    for (const object of hidden) object.visible = false
    const held = renderer.getRenderTarget()
    const shadows = renderer.shadowMap.autoUpdate
    const xr = renderer.xr.enabled
    const tone = renderer.toneMapping
    renderer.shadowMap.autoUpdate = false
    renderer.xr.enabled = false
    renderer.toneMapping = THREE.NoToneMapping
    const texture = this.target.texture
    texture.generateMipmaps = face === 5
    renderer.setRenderTarget(this.target, face)
    renderer.render(scene, camera)
    renderer.setRenderTarget(held)
    renderer.shadowMap.autoUpdate = shadows
    renderer.xr.enabled = xr
    renderer.toneMapping = tone
    for (const [index, object] of hidden.entries()) object.visible = shown[index] ?? true
    this.drawn++
    if (face === 5 && this.drawn >= 6) {
      texture.needsPMREMUpdate = true
      this.ready = true
    }
  }
  dispose() {
    this.target.dispose()
  }
}
