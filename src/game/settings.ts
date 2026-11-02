import { defaults, type Settings } from './world'
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
      'vehicle',
      'camera',
      'quality',
      'units',
    ] as const) {
      const options: Record<typeof key, readonly string[]> = {
        landscape: ['highlands', 'alpine', 'desert'],
        season: ['summer', 'autumn', 'winter'],
        daylight: ['day', 'sunset', 'night'],
        vehicle: ['touring', 'roadster', 'motorcycle', 'bus'],
        camera: cameras,
        quality: ['high', 'low'],
        units: ['km', 'mi'],
      }
      if (typeof values[key] === 'string' && options[key].includes(values[key]))
        Object.assign(result, { [key]: values[key] })
    }
    for (const key of ['volume', 'grip', 'power', 'seed'] as const)
      if (typeof values[key] === 'number' && Number.isFinite(values[key])) {
        const range = key === 'volume' ? [0, 1] : key === 'seed' ? [0, 99999] : [0.5, 2]
        Object.assign(result, {
          [key]: Math.max(range[0] ?? 0, Math.min(range[1] ?? 1, values[key])),
        })
      }
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
