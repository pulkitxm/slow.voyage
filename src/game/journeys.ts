import type { Daylight, Landscape, Season, Settings } from './world'

interface Journey {
  name: string
  landscape: Landscape
  season: Season
  daylight: Daylight
}
export const journeys: readonly Journey[] = [
  { name: 'Summer hills', landscape: 'highlands', season: 'summer', daylight: 'day' },
  { name: 'Autumn evening', landscape: 'highlands', season: 'autumn', daylight: 'sunset' },
  { name: 'Winter hills', landscape: 'highlands', season: 'winter', daylight: 'day' },
  { name: 'Alpine summer', landscape: 'alpine', season: 'summer', daylight: 'day' },
  { name: 'Alpine winter', landscape: 'alpine', season: 'winter', daylight: 'sunset' },
  { name: 'Desert afternoon', landscape: 'desert', season: 'summer', daylight: 'day' },
  { name: 'Desert sunset', landscape: 'desert', season: 'autumn', daylight: 'sunset' },
  { name: 'Summer night', landscape: 'highlands', season: 'summer', daylight: 'night' },
  { name: 'Alpine night', landscape: 'alpine', season: 'winter', daylight: 'night' },
]
export function nextJourney(settings: Settings, direction: number) {
  const index = journeys.findIndex(
    (journey) =>
      journey.landscape === settings.landscape &&
      journey.season === settings.season &&
      journey.daylight === settings.daylight,
  )
  const start = index < 0 ? (direction > 0 ? -1 : 0) : index
  const journey = journeys[(start + Math.sign(direction) + journeys.length) % journeys.length]
  if (!journey) throw new Error('Journey presets are unavailable')
  return journey
}
