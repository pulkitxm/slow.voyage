import * as THREE from 'three'
import albedoUrl from '../assets/rock-albedo.jpg'
import normalUrl from '../assets/rock-normal.png'

function loadSurfaceTexture(url: string, colorSpace: THREE.ColorSpace) {
  const texture = new THREE.Texture()
  texture.colorSpace = colorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 8
  const ready = new THREE.ImageLoader().loadAsync(url).then((image) => {
    texture.image = image
    texture.needsUpdate = true
  })
  return { texture, ready }
}

export function loadRockSurface() {
  const albedo = loadSurfaceTexture(albedoUrl, THREE.SRGBColorSpace)
  const normal = loadSurfaceTexture(normalUrl, THREE.NoColorSpace)
  return {
    albedo: albedo.texture,
    normal: normal.texture,
    ready: Promise.all([albedo.ready, normal.ready]),
  }
}
