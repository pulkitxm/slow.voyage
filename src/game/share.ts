import { worldLoop } from './field'
import { type Landscape, landscapeIds } from './landscapes'

export interface SharedSpot {
  landscape: Landscape
  seed: number
  distance: number
}

export function encodeSpot(spot: SharedSpot) {
  const lap = ((spot.distance % worldLoop.length) + worldLoop.length) % worldLoop.length
  return `#${spot.landscape}-${Math.round(spot.seed)}@${(lap / 1000).toFixed(1)}`
}

export function decodeSpot(hash: string): SharedSpot | null {
  const match = /^#?([a-z]+)-(\d{1,5})@(\d{1,2}(?:\.\d)?)$/.exec(hash)
  if (!match) return null
  const landscape = landscapeIds.find((id) => id === match[1])
  const seed = Number(match[2])
  const distance = Number(match[3]) * 1000
  if (!landscape || seed > 99999 || distance >= worldLoop.length) return null
  return { landscape, seed, distance }
}
