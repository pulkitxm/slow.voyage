import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { garageClearing } from './garages'
import { sharpness } from './graphics'
import { guardrailAt, roadPoint } from './road'
import { angleDifference, type World } from './world'

export const roadsideLayout = {
  postSpacing: 30,
  postOffset: 3.85,
  postHeight: 0.95,
  chevronSpacing: 20,
  chevronCurve: 1 / 240,
  chevronOffset: 4.7,
} as const

export const delineatorLook = {
  width: 0.12,
  depth: 0.04,
  band: { from: 0.66, to: 0.9, proud: 0.004 },
  reflector: { width: 0.045, height: 0.15, depth: 0.052 },
  body: [0.8, 0.8, 0.77],
  foot: [0.5, 0.47, 0.4],
  dark: [0.035, 0.035, 0.04],
  steel: [0.42, 0.44, 0.45],
} as const
export const delineatorVertices = { post: 48, reflector: 24 } as const

function placed(geometry: THREE.BufferGeometry, yaw: number, x: number, y: number, s: number) {
  geometry.deleteAttribute('uv')
  geometry.rotateY(yaw)
  geometry.translate(x, y, -s)
  return geometry
}

function tinted(
  geometry: THREE.BufferGeometry,
  top: readonly number[],
  bottom: readonly number[] = top,
) {
  const position = geometry.getAttribute('position')
  geometry.computeBoundingBox()
  const low = geometry.boundingBox?.min.y ?? 0
  const high = geometry.boundingBox?.max.y ?? 1
  const colors = new Float32Array(position.count * 3)
  for (let index = 0; index < position.count; index++) {
    const rise = (position.getY(index) - low) / Math.max(high - low, 1e-6)
    for (let channel = 0; channel < 3; channel++)
      colors[index * 3 + channel] =
        (bottom[channel] ?? 0) +
        ((top[channel] ?? 0) - (bottom[channel] ?? 0)) * Math.min(1, rise * 3)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

function delineatorPost(height: number) {
  const { width, depth, band, body, foot, dark } = delineatorLook
  const stake = tinted(new THREE.BoxGeometry(width, height, depth), body, foot)
  const sleeve = tinted(
    new THREE.BoxGeometry(
      width + band.proud * 2,
      height * (band.to - band.from),
      depth + band.proud * 2,
    ),
    dark,
  )
  sleeve.translate(0, height * ((band.from + band.to) / 2 - 0.5), 0)
  const post = mergeGeometries([stake, sleeve])
  stake.dispose()
  sleeve.dispose()
  if (!post) throw new Error('Delineator post could not be built')
  return post
}

export function roadCurvature(world: World, s: number) {
  return angleDifference(world.road(s + 6).yaw, world.road(s - 6).yaw) / 12
}

export function delineators(world: World, start: number, length: number) {
  const posts: THREE.BufferGeometry[] = []
  const reflectors: THREE.BufferGeometry[] = []
  const spots: { x: number; y: number; s: number }[] = []
  const { postSpacing, postOffset, postHeight } = roadsideLayout
  const first = Math.ceil(start / postSpacing) * postSpacing
  for (let s = first; s < start + length; s += postSpacing) {
    const road = world.road(s)
    for (const side of [-1, 1]) {
      if (guardrailAt(world, s, side)) continue
      const point = roadPoint(road, s, side * postOffset)
      if (garageClearing(world, point.x, point.s)) continue
      const ground = world.height(point.x, point.s)
      if (ground < road.y - 1.2) continue
      spots.push({ x: point.x, y: ground, s: point.s })
      posts.push(
        placed(delineatorPost(postHeight), road.yaw, point.x, ground + postHeight / 2, point.s),
      )
      const { reflector, band } = delineatorLook
      reflectors.push(
        placed(
          new THREE.BoxGeometry(reflector.width, reflector.height, reflector.depth),
          road.yaw,
          point.x,
          ground + (postHeight * (band.from + band.to)) / 2,
          point.s,
        ),
      )
    }
  }
  return { posts, reflectors, spots }
}

export function chevrons(world: World, start: number, length: number) {
  const posts: THREE.BufferGeometry[] = []
  const panels: THREE.BufferGeometry[] = []
  const feet: { x: number; s: number }[] = []
  const { chevronSpacing, chevronCurve, chevronOffset } = roadsideLayout
  const first = Math.ceil(start / chevronSpacing) * chevronSpacing
  for (let s = first; s < start + length; s += chevronSpacing) {
    const curve = roadCurvature(world, s)
    if (Math.abs(curve) < chevronCurve) continue
    const side = Math.sign(curve)
    if (guardrailAt(world, s, side)) continue
    const road = world.road(s)
    const point = roadPoint(road, s, side * chevronOffset)
    if (garageClearing(world, point.x, point.s)) continue
    const ground = world.height(point.x, point.s)
    if (ground < road.y - 1.5) continue
    feet.push({ x: point.x, s: point.s })
    posts.push(
      placed(
        tinted(new THREE.BoxGeometry(0.06, 1.5, 0.06), delineatorLook.steel),
        road.yaw,
        point.x,
        ground + 0.75,
        point.s,
      ),
    )
    const panel = new THREE.PlaneGeometry(0.75, 0.6)
    if (side < 0) panel.scale(-1, 1, 1)
    panel.rotateY(road.yaw)
    panel.translate(point.x, ground + 1.35, -point.s)
    panels.push(panel)
  }
  return { posts, panels, feet }
}

function canvasTexture(
  width: number,
  height: number,
  paint: (c: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Roadside texture canvas is unavailable')
  paint(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = sharpness(4)
  return texture
}

export function chevronTexture() {
  return canvasTexture(128, 96, (context) => {
    context.fillStyle = '#f2c230'
    context.fillRect(0, 0, 128, 96)
    context.fillStyle = '#16181a'
    for (const offset of [0, 44]) {
      context.beginPath()
      context.moveTo(62 + offset, 8)
      context.lineTo(36 + offset, 8)
      context.lineTo(8 + offset, 48)
      context.lineTo(36 + offset, 88)
      context.lineTo(62 + offset, 88)
      context.lineTo(34 + offset, 48)
      context.closePath()
      context.fill()
    }
    context.strokeStyle = '#16181a'
    context.lineWidth = 6
    context.strokeRect(3, 3, 122, 90)
  })
}
