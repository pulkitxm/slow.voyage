import { describe, expect, test } from 'bun:test'
import { fitEngine, swapEngines } from './engines'
import {
  type Needle,
  stepNeedle,
  tachAngle,
  tachEnd,
  tachRpm,
  tachScale,
  tachStart,
} from './tachometer'
import { vehicles } from './world'

describe('tachometer', () => {
  test('every engine reads its full range with room above the redline', () => {
    for (const vehicle of vehicles)
      for (const engine of ['stock' as const, ...swapEngines]) {
        const { redline } = fitEngine(vehicle, engine).profile
        const scale = tachScale(redline)
        expect(scale.max).toBeGreaterThan(redline)
        expect(scale.max - redline).toBeLessThanOrEqual(1000)
        expect(scale.ticks.at(-1)).toBe(scale.max)
        expect(scale.labels[0]).toBe(0)
        expect(scale.labels.length).toBeLessThanOrEqual(11)
        expect(scale.ticks.length).toBeLessThanOrEqual(21)
        expect(scale.shift).toBeLessThan(redline)
      }
  })
  test('a slow diesel gets half steps and a screaming engine gets wider labels', () => {
    expect(tachScale(2500).ticks).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000])
    expect(tachScale(2500).labels).toEqual([0, 1000, 2000, 3000])
    expect(tachScale(11500).labels).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000])
    expect(tachScale(19000).labels).toEqual([0, 5000, 10000, 15000, 20000])
  })
  test('the needle sweeps from lower left over the top and stays on the dial', () => {
    expect(tachAngle(0, 7000)).toBe(tachStart)
    expect(tachAngle(7000, 7000)).toBe(tachEnd)
    expect(tachAngle(3500, 7000)).toBe((tachStart + tachEnd) / 2)
    expect(tachAngle(-100, 7000)).toBe(tachStart)
    expect(tachAngle(9000, 7000)).toBe(tachEnd)
    expect(tachStart).toBeLessThan(-90)
    expect(tachEnd).toBeGreaterThan(90)
    expect(tachEnd - tachStart).toBeLessThan(270)
    expect(tachRpm(0.5, 6500)).toBe(3250)
    expect(tachRpm(1.4, 6500)).toBe(6500)
  })
  const run = (target: number, seconds: number, calm = false, dt = 1 / 60) => {
    let needle: Needle = { position: 0.1, velocity: 0 }
    const trace: number[] = []
    for (let time = 0; time < seconds; time += dt) {
      needle = stepNeedle(needle, target, dt, calm)
      trace.push(needle.position)
    }
    return trace
  }
  test('the needle sweeps to a new reading quickly with a small natural overshoot', () => {
    const trace = run(0.7, 1)
    const settled = trace.findIndex((_, index) =>
      trace.slice(index).every((later) => Math.abs(later - 0.7) < 0.006),
    )
    expect(settled / 60).toBeLessThan(0.4)
    expect(Math.max(...trace)).toBeGreaterThan(0.7)
    expect(Math.max(...trace) - 0.7).toBeLessThan(0.05)
    const steps = trace.slice(1).map((value, index) => Math.abs(value - (trace[index] ?? 0)))
    expect(Math.max(...steps)).toBeLessThan(0.12)
  })
  test('reduced motion settles without overshoot', () => {
    const trace = run(0.7, 1, true)
    expect(Math.max(...trace)).toBeLessThanOrEqual(0.7)
    expect(trace.at(-1)).toBeCloseTo(0.7, 2)
  })
  test('the needle rests on its stops and survives a long frame', () => {
    for (const value of run(1.6, 1)) expect(value).toBeLessThanOrEqual(1)
    for (const value of run(-1, 1)) expect(value).toBeGreaterThanOrEqual(0)
    for (const value of run(0.5, 2, false, 0.25)) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(run(0.5, 2, false, 0.25).at(-1)).toBeCloseTo(0.5, 3)
  })
})
