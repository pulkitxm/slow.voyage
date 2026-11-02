import type { Daylight, Landscape, Season, Settings, Weather } from './world'

interface Journey {
  name: string
  landscape: Landscape
  season: Season
  daylight: Daylight
  weather: Weather
}
export const journeys: readonly Journey[] = [
  {
    name: 'Summer hills',
    landscape: 'highlands',
    season: 'summer',
    daylight: 'day',
    weather: 'clear',
  },
  {
    name: 'Autumn evening',
    landscape: 'highlands',
    season: 'autumn',
    daylight: 'sunset',
    weather: 'overcast',
  },
  {
    name: 'Winter hills',
    landscape: 'highlands',
    season: 'winter',
    daylight: 'day',
    weather: 'fog',
  },
  {
    name: 'Alpine summer',
    landscape: 'alpine',
    season: 'summer',
    daylight: 'day',
    weather: 'clear',
  },
  {
    name: 'Alpine winter',
    landscape: 'alpine',
    season: 'winter',
    daylight: 'sunset',
    weather: 'rain',
  },
  {
    name: 'Desert afternoon',
    landscape: 'desert',
    season: 'summer',
    daylight: 'day',
    weather: 'clear',
  },
  {
    name: 'Desert sunset',
    landscape: 'desert',
    season: 'autumn',
    daylight: 'sunset',
    weather: 'overcast',
  },
  {
    name: 'Summer night',
    landscape: 'highlands',
    season: 'summer',
    daylight: 'night',
    weather: 'clear',
  },
  {
    name: 'Alpine night',
    landscape: 'alpine',
    season: 'winter',
    daylight: 'night',
    weather: 'rain',
  },
]
export function nextJourney(settings: Settings, direction: number) {
  const index = journeys.findIndex(
    (journey) =>
      journey.landscape === settings.landscape &&
      journey.season === settings.season &&
      journey.daylight === settings.daylight &&
      journey.weather === settings.weather,
  )
  const start = index < 0 ? (direction > 0 ? -1 : 0) : index
  const journey = journeys[(start + Math.sign(direction) + journeys.length) % journeys.length]
  if (!journey) throw new Error('Journey presets are unavailable')
  return journey
}
