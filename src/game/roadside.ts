import * as THREE from 'three'
import { sharpness } from './graphics'
import { guardrailAt, roadLayout, roadPoint } from './road'
import { angleDifference, type World } from './world'

export const roadsideLayout = {
  postSpacing: 30,
  postOffset: 3.85,
  postHeight: 0.95,
  chevronSpacing: 20,
  chevronCurve: 1 / 240,
  chevronOffset: 4.7,
  gantryOffset: 4.9,
  gantryHeight: 5.4,
} as const

function placed(geometry: THREE.BufferGeometry, yaw: number, x: number, y: number, s: number) {
  geometry.deleteAttribute('uv')
  geometry.rotateY(yaw)
  geometry.translate(x, y, -s)
  return geometry
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
      const ground = world.height(point.x, point.s)
      if (ground < road.y - 1.2) continue
      spots.push({ x: point.x, y: ground, s: point.s })
      posts.push(
        placed(
          new THREE.BoxGeometry(0.1, postHeight, 0.05),
          road.yaw,
          point.x,
          ground + postHeight / 2,
          point.s,
        ),
      )
      reflectors.push(
        placed(
          new THREE.BoxGeometry(0.075, 0.14, 0.064),
          road.yaw,
          point.x,
          ground + postHeight - 0.16,
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
    const ground = world.height(point.x, point.s)
    if (ground < road.y - 1.5) continue
    feet.push({ x: point.x, s: point.s })
    posts.push(
      placed(new THREE.BoxGeometry(0.07, 1.5, 0.07), road.yaw, point.x, ground + 0.75, point.s),
    )
    const panel = new THREE.PlaneGeometry(0.75, 0.6)
    if (side < 0) panel.scale(-1, 1, 1)
    panel.rotateY(road.yaw)
    panel.translate(point.x, ground + 1.35, -point.s)
    panels.push(panel)
  }
  return { posts, panels, feet }
}

export function startGantry(world: World, s: number) {
  const { gantryOffset, gantryHeight } = roadsideLayout
  const road = world.road(s)
  const frame: THREE.BufferGeometry[] = []
  const feet: { x: number; s: number }[] = []
  for (const side of [-1, 1]) {
    const point = roadPoint(road, s, side * gantryOffset)
    const ground = Math.min(road.y, world.height(point.x, point.s))
    const height = road.y + gantryHeight - ground
    frame.push(
      placed(
        new THREE.BoxGeometry(0.22, height, 0.22),
        road.yaw,
        point.x,
        ground + height / 2,
        point.s,
      ),
    )
    feet.push({ x: point.x, s: point.s })
  }
  for (const lift of [0, -0.95])
    frame.push(
      placed(
        new THREE.BoxGeometry(gantryOffset * 2 + 0.22, 0.14, 0.14),
        road.yaw,
        road.x,
        road.y + gantryHeight + lift,
        s,
      ),
    )
  const banner = new THREE.PlaneGeometry(gantryOffset * 2 - 0.3, 0.8)
  banner.rotateY(road.yaw)
  banner.translate(road.x, road.y + gantryHeight - 0.475, -s)
  return { frame, banner, feet, clearance: gantryHeight - 1.05 - roadLayout.surfaceRecess }
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

export function bannerTexture() {
  return canvasTexture(384, 32, (context) => {
    for (let column = 0; column < 24; column++)
      for (let row = 0; row < 2; row++) {
        context.fillStyle = (column + row) % 2 ? '#f4f2e8' : '#17191b'
        context.fillRect(column * 16, row * 16, 16, 16)
      }
  })
}
