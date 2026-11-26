import { type Landscape, landscapeIds } from './landscapes'
import { type RoadMode, roadModes } from './world'

export interface SharedSpot {
  landscape: Landscape
  seed: number
  distance: number
  roadMode?: RoadMode
}

export function encodeSpot(spot: SharedSpot) {
  const along = Math.max(0, spot.distance)
  const mode = spot.roadMode && spot.roadMode !== 'winding' ? `-${spot.roadMode}` : ''
  return `#${spot.landscape}-${Math.round(spot.seed)}${mode}@${(along / 1000).toFixed(1)}`
}

export function decodeSpot(hash: string): SharedSpot | null {
  const match = /^#?([a-z]+)-(\d{1,5})(?:-([a-z]+))?@(\d{1,6}(?:\.\d)?)$/.exec(hash)
  if (!match) return null
  const landscape = landscapeIds.find((id) => id === match[1])
  const seed = Number(match[2])
  const roadMode = match[3] ? roadModes.find((id) => id === match[3]) : 'winding'
  const distance = Number(match[4]) * 1000
  if (!landscape || !roadMode || seed > 99999) return null
  return { landscape, seed, distance, roadMode }
}
