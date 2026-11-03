import { defaults, type Settings } from './world'

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
      'season',
      'daylight',
      'weather',
      'vehicle',
      'camera',
      'quality',
      'units',
      'autodriveMode',
    ] as const) {
      const options: Record<typeof key, readonly string[]> = {
        landscape: ['highlands', 'alpine', 'desert'],
        season: ['summer', 'autumn', 'winter'],
        daylight: ['day', 'sunset', 'night'],
        weather: ['clear', 'overcast', 'rain', 'fog'],
        vehicle: ['touring', 'roadster', 'motorcycle', 'bus'],
        camera: cameras,
        quality: ['high', 'low'],
        units: ['km', 'mi'],
        autodriveMode: ['full', 'steer', 'speed'],
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
    for (const key of ['onePedal', 'controllerEnabled', 'mouseEnabled'] as const)
      if (typeof values[key] === 'boolean') result[key] = values[key]
    if (typeof values.color === 'string' && /^#[0-9a-f]{6}$/i.test(values.color))
      result.color = values.color
    return result
  } catch {
    return { ...defaults }
  }
}

export function loadSettings(): Settings {
  try {
    return decodeSettings(JSON.parse(localStorage.getItem('slowroads-settings') ?? 'null'))
  } catch {
    return { ...defaults }
  }
}

import { cruiseLimits } from './cruise'
