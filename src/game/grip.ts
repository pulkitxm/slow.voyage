import type { Settings, Weather } from './world'

const weatherGrip: Record<Weather, number> = {
  clear: 1,
  overcast: 1,
  rain: 0.72,
  fog: 1,
}

export function surfaceGrip(
  settings: Pick<Settings, 'grip' | 'season' | 'weather'>,
  onRoad: boolean,
) {
  const condition = settings.season === 'winter' ? 0.58 : weatherGrip[settings.weather]
  return settings.grip * condition * (onRoad ? 1 : 0.64)
}
