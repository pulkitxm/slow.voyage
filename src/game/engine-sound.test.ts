import { describe, expect, it } from 'bun:test'
import {
  afterfire,
  EngineVoice,
  engineSounds,
  firingFrequency,
  soundVehicles,
  spoolTurbo,
  turboSpool,
} from './engine-sound'
import { engineProfiles } from './powertrain'
import { type Vehicle, vehicles } from './world'

const rate = 48000

interface Run {
  revs: number
  load: number
  throttle?: number
  cutting?: number
  seconds?: number
  steady?: boolean
  prepare?(engine: EngineVoice): void
  step?(engine: EngineVoice, time: number): void
}

function render(vehicle: Vehicle, run: Run) {
  const profile = engineProfiles[vehicle]
  const engine = new EngineVoice(rate, 1)
  engine.configure(engineSounds[vehicle])
  engine.steady = run.steady ?? true
  engine.idle = profile.idle
  engine.redline = profile.redline
  engine.rpm = profile.idle + (profile.redline - profile.idle) * run.revs
  engine.load = run.load
  engine.throttle = run.throttle ?? run.load
  engine.cutting = run.cutting ?? 0
  run.prepare?.(engine)
  const frames = Math.round((run.seconds ?? 1.5) * rate)
  const names = ['left', 'right', 'bay', 'turbo'] as const
  const out = {
    left: new Float32Array(frames),
    right: new Float32Array(frames),
    bay: new Float32Array(frames),
    turbo: new Float32Array(frames),
    rpm: engine.rpm,
    engine,
  }
  const block = names.map(() => new Float32Array(128))
  for (let at = 0; at + 128 <= frames; at += 128) {
    run.step?.(engine, at / rate)
    engine.render(
      block[0] as Float32Array,
      block[1] as Float32Array,
      block[2] as Float32Array,
      block[3] as Float32Array,
      128,
    )
    for (const [index, name] of names.entries()) out[name].set(block[index] as Float32Array, at)
  }
  return out
}

function loudness(signal: Float32Array, from = 0.4, to = Number.POSITIVE_INFINITY) {
  let sum = 0
  let count = 0
  for (let i = Math.round(from * rate); i < Math.min(signal.length, to * rate); i++) {
    sum += (signal[i] as number) ** 2
    count++
  }
  return Math.sqrt(sum / Math.max(1, count))
}

function line(signal: Float32Array, frequency: number) {
  const from = Math.round(0.4 * rate)
  const count = signal.length - from
  let real = 0
  let imaginary = 0
  for (let i = 0; i < count; i++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (count - 1))
    const angle = (2 * Math.PI * frequency * i) / rate
    real += (signal[from + i] as number) * window * Math.cos(angle)
    imaginary += (signal[from + i] as number) * window * Math.sin(angle)
  }
  return Math.hypot(real, imaginary) / count
}

describe('engine layouts', () => {
  it('covers every vehicle with its own believable layout', () => {
    expect([...soundVehicles].sort()).toEqual([...vehicles].sort())
    expect(new Set(vehicles.map((vehicle) => engineSounds[vehicle].layout)).size).toBe(
      vehicles.length,
    )
    expect(engineSounds.touring.cylinders).toBe(8)
    expect(engineSounds.hatchback.cylinders).toBe(4)
    expect(engineSounds.supercar.cylinders).toBe(12)
    expect(engineSounds.bus.cylinders).toBe(6)
    expect(engineSounds.motorcycle.cylinders).toBe(2)
  })

  it.each(vehicles)('%s fires every cylinder once in two turns of the crank', (vehicle) => {
    const sound = engineSounds[vehicle]
    expect(sound.firing).toHaveLength(sound.cylinders)
    expect(sound.banks).toHaveLength(sound.cylinders)
    expect(new Set(sound.firing).size).toBe(sound.cylinders)
    for (const angle of sound.firing) {
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThan(720)
    }
    for (const bank of sound.banks) expect([0, 1]).toContain(bank)
  })

  it('splits both V8s into banks that fire unevenly, the source of their burble', () => {
    for (const vehicle of ['touring', 'pickup'] as const) {
      const sound = engineSounds[vehicle]
      const gaps = sound.firing
        .filter((_, index) => sound.banks[index] === 0)
        .map((angle, index, list) => ((list[(index + 1) % list.length] ?? 0) - angle + 720) % 720)
      expect(new Set(gaps).size).toBeGreaterThan(1)
    }
    expect(engineSounds.pickup.crossover).toBeLessThan(engineSounds.touring.crossover)
  })

  it('boosts and clatters only where the engine calls for it', () => {
    expect(engineSounds.bus.clatter).toBeGreaterThan(0)
    expect(engineSounds.bus.turbo).not.toBeNull()
    expect(engineSounds.hatchback.turbo?.flutter).toBeGreaterThan(0)
    for (const vehicle of vehicles.filter((name) => name !== 'bus'))
      expect(engineSounds[vehicle].clatter).toBe(0)
    for (const vehicle of ['supercar', 'roadster', 'motorcycle', 'touring', 'pickup'] as const)
      expect(engineSounds[vehicle].turbo).toBeNull()
  })
})

describe('rendered exhaust', () => {
  it.each(vehicles)('%s fires at exactly the combustion rate', (vehicle) => {
    const sound = engineSounds[vehicle]
    for (const revs of [0.2, 0.55, 0.9]) {
      const { left, rpm } = render(vehicle, { revs, load: 0.8 })
      const expected = firingFrequency(sound, rpm)
      expect(expected).toBeCloseTo((rpm / 60) * (sound.cylinders / 2), 9)
      const on = line(left, expected)
      expect(on).toBeGreaterThan(line(left, expected * 1.03) * 6)
      expect(on).toBeGreaterThan(line(left, expected * 0.97) * 6)
    }
  })

  it.each(vehicles)('%s grows louder and brighter with load', (vehicle) => {
    const coasting = render(vehicle, { revs: 0.5, load: 0 })
    const pulling = render(vehicle, { revs: 0.5, load: 1 })
    expect(loudness(pulling.left)).toBeGreaterThan(loudness(coasting.left) * 3)
    expect(loudness(pulling.bay)).toBeGreaterThan(loudness(coasting.bay) * 2)
    const crossings = (signal: Float32Array) => {
      let count = 0
      for (let i = rate / 2; i < signal.length; i++)
        if ((signal[i] as number) > 0 !== (signal[i - 1] as number) > 0) count++
      return count
    }
    expect(crossings(pulling.left)).toBeGreaterThan(crossings(coasting.left))
  })

  it.each(vehicles)('%s stays finite, bounded and free of a constant offset', (vehicle) => {
    for (const run of [
      { revs: 0, load: 0 },
      { revs: 1, load: 1 },
      { revs: 0.8, load: 0, steady: false },
    ]) {
      const out = render(vehicle, run)
      for (const signal of [out.left, out.right, out.bay, out.turbo]) {
        let sum = 0
        let peak = 0
        for (let i = 0; i < signal.length; i++) {
          const value = signal[i] as number
          peak = Math.max(peak, Math.abs(value))
          if (i > rate / 2) sum += value
        }
        expect(peak).toBeLessThan(8)
        expect(Math.abs(sum / (signal.length - rate / 2))).toBeLessThan(0.002)
      }
    }
  })

  it('goes nearly silent while the limiter cuts the engine', () => {
    const firing = render('roadster', { revs: 1, load: 1 })
    const cut = render('roadster', { revs: 1, load: 1, cutting: 1 })
    expect(loudness(cut.left)).toBeLessThan(loudness(firing.left) * 0.25)
  })

  it('idles with uneven cycles unless told to hold steady', () => {
    const steady = render('pickup', { revs: 0, load: 0, seconds: 3 })
    const live = render('pickup', { revs: 0, load: 0, seconds: 3, steady: false })
    const rpm = steady.rpm
    const period = Math.round((rate * 120) / rpm)
    const variation = (signal: Float32Array) => {
      const peaks: number[] = []
      for (let at = rate; at + period <= signal.length; at += period) {
        let peak = 0
        for (let i = at; i < at + period; i++) peak = Math.max(peak, Math.abs(signal[i] as number))
        peaks.push(peak)
      }
      const mean = peaks.reduce((sum, value) => sum + value, 0) / peaks.length
      return (
        Math.sqrt(peaks.reduce((sum, value) => sum + (value - mean) ** 2, 0) / peaks.length) / mean
      )
    }
    expect(variation(live.left)).toBeGreaterThan(variation(steady.left) * 2)
    expect(variation(live.left)).toBeGreaterThan(0.03)
  })

  it('renders the same samples again from the same seed', () => {
    const one = render('supercar', { revs: 0.6, load: 0.7, steady: false, seconds: 0.5 })
    const two = render('supercar', { revs: 0.6, load: 0.7, steady: false, seconds: 0.5 })
    expect(Array.from(one.left.subarray(0, 4000))).toEqual(Array.from(two.left.subarray(0, 4000)))
  })

  it('keeps separate banks audibly different on a V8 and identical on a single pipe', () => {
    const v8 = render('pickup', { revs: 0.4, load: 0.8, seconds: 0.6 })
    const four = render('hatchback', { revs: 0.4, load: 0.8, seconds: 0.6 })
    let apart = 0
    let together = 0
    for (let i = 0; i < v8.left.length; i++) {
      apart += Math.abs((v8.left[i] as number) - (v8.right[i] as number))
      together += Math.abs((four.left[i] as number) - (four.right[i] as number))
    }
    expect(apart).toBeGreaterThan(1)
    expect(together).toBe(0)
  })
})

describe('overrun and afterfire', () => {
  it('pops on sporty engines after a hard pull and never on calm or cold ones', () => {
    expect(afterfire(engineSounds.roadster, 0.8, 0.8, true)).toBeGreaterThan(0.2)
    expect(afterfire(engineSounds.roadster, 0.8, 0.8, false)).toBeGreaterThan(0)
    expect(afterfire(engineSounds.roadster, 0.8, 0.8, true)).toBeGreaterThan(
      afterfire(engineSounds.roadster, 0.8, 0.8, false) * 3,
    )
    expect(afterfire(engineSounds.roadster, 0, 0.8, false)).toBe(0)
    expect(afterfire(engineSounds.roadster, 1, 0.2, true)).toBe(0)
    expect(afterfire(engineSounds.bus, 1, 0.9, true)).toBe(0)
    expect(afterfire(engineSounds.supercar, 1, 1, true)).toBeLessThanOrEqual(0.9)
  })

  it('crackles on a lift after a pull, louder than a cold overrun', () => {
    const lift = (warm: boolean) =>
      render('roadster', {
        revs: 0.8,
        load: 1,
        steady: false,
        seconds: 3,
        prepare: (engine) => {
          if (!warm) engine.load = engine.throttle = 0
        },
        step: (engine, time) => {
          if (time > 1.5) engine.load = engine.throttle = 0
        },
      })
    const crest = (signal: Float32Array) => {
      let peak = 0
      for (let i = Math.round(1.6 * rate); i < signal.length; i++)
        peak = Math.max(peak, Math.abs(signal[i] as number))
      return peak
    }
    expect(crest(lift(true).left)).toBeGreaterThan(crest(lift(false).left) * 1.8)
  })
})

describe('turbocharger', () => {
  it('spools up with lag under load and bleeds off faster when lifted', () => {
    let spool = 0
    for (let step = 0; step < 12; step++) spool = spoolTurbo(spool, 1, 0.8, 1 / 60)
    expect(spool).toBeGreaterThan(0.2)
    expect(spool).toBeLessThan(0.5)
    for (let step = 0; step < 240; step++) spool = spoolTurbo(spool, 1, 0.8, 1 / 60)
    expect(spool).toBeGreaterThan(0.97)
    const full = spool
    for (let step = 0; step < 12; step++) spool = spoolTurbo(spool, 0, 0.8, 1 / 60)
    expect(spool).toBeLessThan(full * 0.5)
    expect(turboSpool.fall).toBeLessThan(turboSpool.rise)
    expect(spoolTurbo(0, 1, 0, 1)).toBe(0)
  })

  it('whistles only on boosted engines, and louder as pressure builds', () => {
    const early = render('hatchback', { revs: 0.8, load: 1, seconds: 0.5 })
    const late = render('hatchback', { revs: 0.8, load: 1, seconds: 3 })
    expect(loudness(late.turbo, 2.5)).toBeGreaterThan(loudness(early.turbo, 0.1, 0.4) * 3)
    expect(loudness(render('supercar', { revs: 0.8, load: 1 }).turbo)).toBe(0)
    expect(late.engine.spool).toBeGreaterThan(0.9)
  })

  it('vents through the blow-off valve when a spooled engine lifts', () => {
    const run = (vehicle: Vehicle) =>
      render(vehicle, {
        revs: 0.8,
        load: 1,
        seconds: 3.2,
        step: (engine, time) => {
          if (time > 2.5) engine.load = engine.throttle = 0
        },
      })
    const hatch = run('hatchback')
    expect(loudness(hatch.turbo, 2.52, 2.7)).toBeGreaterThan(loudness(hatch.turbo, 2.2, 2.5) * 1.5)
    expect(hatch.engine.spool).toBeLessThan(0.1)
    expect(loudness(hatch.turbo, 3.1)).toBeLessThan(loudness(hatch.turbo, 2.52, 2.7) * 0.2)
  })
})
