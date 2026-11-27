import * as THREE from 'three'
import { groundGeometry } from './ground'
import { groundLayout } from './ground-grid'
import { nodeSize } from './open-grid'
import { openGeometry } from './open-ground'
import type { World } from './world'

export function groundRegion(world: World, x: number, s: number) {
  if (Math.abs(x - world.road(s).x) <= groundLayout.reach - 0.5)
    return `corridor/${Math.floor(s / groundLayout.tileLength)}`
  const size = nodeSize(0)
  return `open/${Math.floor(x / size)}/${Math.floor(s / size)}`
}

export function renderedGround(world: World, x: number, s: number, rows?: number) {
  const tone = new THREE.Color()
  if (Math.abs(x - world.road(s).x) <= groundLayout.reach - 0.5)
    return groundGeometry(
      world,
      Math.floor(s / groundLayout.tileLength) * groundLayout.tileLength,
      tone,
      tone,
      rows,
    )
  const size = nodeSize(0)
  const steps = openGeometry(
    world,
    { level: 0, column: Math.floor(x / size), row: Math.floor(s / size) },
    tone,
    tone,
    Number.POSITIVE_INFINITY,
  )
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}
