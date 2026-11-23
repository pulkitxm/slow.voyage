import * as THREE from 'three'
import asphaltAlbedoUrl from '../assets/asphalt-albedo.webp'
import asphaltNormalUrl from '../assets/asphalt-normal.webp'
import groundDetailUrl from '../assets/ground-detail.webp'
import albedoUrl from '../assets/rock-albedo.jpg'
import normalUrl from '../assets/rock-normal.png'
import { sharpness } from './graphics'

export function loadSurfaceTexture(url: string, colorSpace: THREE.ColorSpace) {
  const texture = new THREE.Texture()
  texture.colorSpace = colorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = sharpness(8)
  const ready = new THREE.ImageLoader().loadAsync(url).then((image) => {
    texture.image = image
    texture.needsUpdate = true
  })
  return { texture, ready }
}

export function loadRoadSurface() {
  const albedo = loadSurfaceTexture(asphaltAlbedoUrl, THREE.SRGBColorSpace)
  const normal = loadSurfaceTexture(asphaltNormalUrl, THREE.NoColorSpace)
  for (const texture of [albedo.texture, normal.texture]) texture.repeat.set(3, 40)
  return { albedo: albedo.texture, normal: normal.texture }
}

export function loadGroundDetail() {
  return loadSurfaceTexture(groundDetailUrl, THREE.NoColorSpace).texture
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
