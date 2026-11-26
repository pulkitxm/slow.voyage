import { decodeBindings } from './controller-bindings'
import { cruiseLimits } from './cruise'
import { engineCars } from './engine-catalog'
import { landscapeIds } from './landscapes'
import { roadWears } from './road-condition'
import {
  cameraMotions,
  defaults,
  engineIds,
  lifeLevels,
  roadModes,
  type Settings,
  steeringAssists,
  transmissions,
  vehicles,
} from './world'

const numericRanges = {
  volume: [0, 1],
  grip: [0.2, 2],
  power: [0.5, 2],
  seed: [0, 99999],
  cruiseSpeed: [-cruiseLimits.reverse, cruiseLimits.forward],
  controllerDeadzone: [0.05, 0.4],
  mouseSensitivity: [0.5, 2],
} as const
export const cameras = ['chase', 'bonnet', 'cinematic'] as const
export function decodeSettings(stored: unknown): Settings {
  try {
    if (!stored || typeof stored !== 'object') return { ...defaults }
    const result = { ...defaults }
    const values = stored as Record<string, unknown>
    for (const key of [
      'landscape',
      'roadMode',
      'season',
      'daylight',
      'weather',
      'roadWear',
      'life',
      'vehicle',
      'engine',
      'engineView',
      'camera',
      'motion',
      'transmission',
      'steeringAssist',
      'quality',
      'units',
      'autodriveMode',
      'controllerMode',
    ] as const) {
      const options: Record<typeof key, readonly string[]> = {
        landscape: landscapeIds,
        roadMode: roadModes,
        season: ['summer', 'autumn', 'winter'],
        daylight: ['dawn', 'day', 'sunset', 'dusk', 'night', 'cycle'],
        weather: ['clear', 'overcast', 'rain', 'storm', 'fog'],
        roadWear: roadWears,
        life: lifeLevels,
        vehicle: vehicles,
        engine: engineIds,
        engineView: ['car', 'engine'],
        camera: cameras,
        motion: cameraMotions,
        transmission: transmissions,
        steeringAssist: steeringAssists,
        quality: ['ultra', 'high', 'low'],
        units: ['km', 'mi'],
        autodriveMode: ['full', 'steer', 'speed'],
        controllerMode: ['standard', 'custom'],
      }
      if (typeof values[key] === 'string' && options[key].includes(values[key]))
        Object.assign(result, { [key]: values[key] })
    }
    for (const [key, [minimum, maximum]] of Object.entries(numericRanges))
      if (typeof values[key] === 'number' && Number.isFinite(values[key])) {
        Object.assign(result, {
          [key]: Math.max(minimum, Math.min(maximum, values[key])),
        })
      }
    for (const key of ['onePedal', 'controllerEnabled', 'mouseEnabled', 'blood'] as const)
      if (typeof values[key] === 'boolean') result[key] = values[key]
    if (
      typeof values.engineCar === 'string' &&
      engineCars.some((car) => car.name === values.engineCar && car.id === result.engine)
    )
      result.engineCar = values.engineCar
    if (typeof values.color === 'string' && /^#[0-9a-f]{6}$/i.test(values.color))
      result.color = values.color
    result.controllerBindings = decodeBindings(values.controllerBindings)
    return result
  } catch {
    return { ...defaults }
  }
}

export function offerUltra(settings: Settings, offered: boolean): Settings {
  return !offered && settings.quality === 'high' ? { ...settings, quality: 'ultra' } : settings
}

export function loadSettings(): Settings {
  try {
    const settings = decodeSettings(
      JSON.parse(localStorage.getItem('slow-voyage-settings') ?? 'null'),
    )
    const offered = localStorage.getItem('slow-voyage-ultra') !== null
    if (!offered) localStorage.setItem('slow-voyage-ultra', 'offered')
    return offerUltra(settings, offered)
  } catch {
    return { ...defaults }
  }
}
