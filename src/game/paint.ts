import * as THREE from 'three'
import { reflectSkyline } from './skyline'

export const paintFinish = {
  metalness: 0.38,
  roughness: 0.42,
  clearcoat: 1,
  clearcoatRoughness: 0.035,
  environment: 1,
  skyline: 2.2,
  chase: 0.42,
  bonnet: 0.3,
  live: 1.7,
  liveSkyline: 0.55,
}

export const paintTone = { depth: 0.7, saturation: 0.86, floor: 0.012 }

const tone = { h: 0, s: 0, l: 0 }

export function tintPaint(paint: THREE.Color, color: THREE.ColorRepresentation) {
  paint.set(color).getHSL(tone)
  paint.setHSL(tone.h, tone.s * paintTone.saturation, tone.l).multiplyScalar(paintTone.depth)
  paint.r = Math.max(paint.r, paintTone.floor)
  paint.g = Math.max(paint.g, paintTone.floor)
  paint.b = Math.max(paint.b, paintTone.floor)
  return paint
}

export function createPaint(color: THREE.ColorRepresentation) {
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: paintFinish.metalness,
    roughness: paintFinish.roughness,
    clearcoat: paintFinish.clearcoat,
    clearcoatRoughness: paintFinish.clearcoatRoughness,
    envMapIntensity: paintFinish.environment,
  })
  reflectSkyline(paint, paintFinish.skyline)
  return paint
}
