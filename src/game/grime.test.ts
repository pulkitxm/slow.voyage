import { describe, expect, it } from 'bun:test'
import { accumulate, grimeGain, grimeTint, keepGrime, loadGrime } from './grime'

const dry = {
  metres: 1000,
  offroad: false,
  wading: false,
  weather: 'clear',
  season: 'summer',
} as const

describe('grime', () => {
  it('builds slowly on a dry road and faster in rain, off the tarmac and through water', () => {
    const base = grimeGain(dry)
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThan(0.1)
    expect(grimeGain({ ...dry, weather: 'rain' })).toBeGreaterThan(base * 2)
    expect(grimeGain({ ...dry, offroad: true })).toBeGreaterThan(base * 5)
    expect(grimeGain({ ...dry, wading: true })).toBeGreaterThan(
      grimeGain({ ...dry, offroad: true }),
    )
    expect(grimeGain({ ...dry, metres: 0 })).toBe(0)
  })
  it('takes many kilometres of clean road to reach full dirt and never overshoots', () => {
    let level = 0
    let kilometres = 0
    while (level < 0.95 && kilometres < 1000) {
      level = accumulate(level, grimeGain(dry))
      kilometres++
    }
    expect(kilometres).toBeGreaterThan(15)
    for (let step = 0; step < 500; step++)
      level = accumulate(level, grimeGain({ ...dry, wading: true }))
    expect(level).toBeLessThanOrEqual(1)
  })
  it('tints dirt for the landscape and turns to salt in winter', () => {
    expect(grimeTint({ landscape: 'desert', season: 'summer' })).not.toBe(
      grimeTint({ landscape: 'forest', season: 'summer' }),
    )
    expect(grimeTint({ landscape: 'desert', season: 'winter' })).toBe(
      grimeTint({ landscape: 'forest', season: 'winter' }),
    )
  })
  it('keeps levels per vehicle and rejects damaged storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    keepGrime(storage, { touring: 0.4, supercar: 2 })
    expect(loadGrime(storage)).toEqual({ touring: 0.4, supercar: 1 })
    store.set('slow-voyage-grime', '{broken')
    expect(loadGrime(storage)).toEqual({})
    expect(loadGrime(null)).toEqual({})
  })
})
