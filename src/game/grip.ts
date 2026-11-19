import { vehicleMetrics } from './vehicles'
import type { Settings, Weather } from './world'

const weatherGrip: Record<Weather, number> = {
  clear: 1,
  overcast: 1,
  rain: 0.72,
  storm: 0.62,
  fog: 1,
}

export const groundGrip = { road: 1, grass: 0.64, sand: 0.5 }

export function surfaceGrip(
  settings: Pick<Settings, 'grip' | 'season' | 'weather' | 'vehicle'>,
  onRoad: boolean,
  sand = false,
) {
  const condition = settings.season === 'winter' ? 0.58 : weatherGrip[settings.weather]
  const metrics = vehicleMetrics[settings.vehicle]
  return (
    settings.grip *
    condition *
    (onRoad
      ? groundGrip.road * metrics.roadGrip
      : (sand ? groundGrip.sand : groundGrip.grass) * metrics.looseGrip)
  )
}
