import { describe, expect, it } from 'bun:test'
import {
  ease,
  easeBack,
  easeOut,
  type Stage,
  span,
  stageDone,
  stageProgress,
  Track,
} from './garage-script'

describe('garage job script', () => {
  it('runs steps in order, each beginning once and ending once', () => {
    const log: string[] = []
    const track = new Track([
      { time: 0.5, begin: () => log.push('a+'), end: () => log.push('a-') },
      { time: 0, begin: () => log.push('b+'), end: () => log.push('b-') },
      { time: 0.25, begin: () => log.push('c+'), end: () => log.push('c-') },
    ])
    for (let frame = 0; frame < 20 && !track.done; frame++) track.update(0.1)
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-', 'c+', 'c-'])
    expect(track.done).toBe(true)
    expect(track.progress).toBe(1)
  })
  it('reports eased progress from zero to one and never runs backwards', () => {
    const seen: number[] = []
    const track = new Track([{ time: 1, run: (progress) => seen.push(progress) }, { time: 1 }])
    let last = 0
    for (let frame = 0; frame < 40; frame++) {
      track.update(1 / 16)
      expect(track.progress).toBeGreaterThanOrEqual(last)
      last = track.progress
    }
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBe(1)
    expect(last).toBe(1)
  })
  it('waits on a condition however long the nominal time is', () => {
    let arrived = false
    let ended = 0
    const track = new Track([{ time: 0, until: () => arrived, end: () => ended++ }, { time: 0.1 }])
    for (let frame = 0; frame < 50; frame++) track.update(0.1)
    expect(track.index).toBe(0)
    expect(track.progress).toBeLessThan(1)
    arrived = true
    track.update(0.1)
    expect(ended).toBe(1)
    track.update(0.2)
    expect(track.done).toBe(true)
  })
  it('finishes a stage only when every track has finished', () => {
    const quick = new Track([{ time: 0.1 }])
    const slow = new Track([{ time: 1 }])
    const stage: Stage = { label: 'Working', tracks: [quick, slow] }
    quick.update(0.2)
    slow.update(0.2)
    expect(stageDone(stage)).toBe(false)
    expect(stageProgress([stage, stage], 0)).toBeLessThan(0.5)
    slow.update(1)
    expect(stageDone(stage)).toBe(true)
    expect(stageProgress([stage, stage], 1)).toBe(1)
    expect(stageProgress([], 0)).toBe(1)
  })
  it('eases between zero and one', () => {
    for (const curve of [ease, easeOut, easeBack]) {
      expect(curve(0)).toBeCloseTo(0, 6)
      expect(curve(1)).toBeCloseTo(1, 6)
      expect(curve(-1)).toBeCloseTo(0, 6)
      expect(curve(2)).toBeCloseTo(1, 6)
    }
    expect(span(0.5, 0.25, 0.75)).toBeCloseTo(0.5, 6)
    expect(span(0.1, 0.25, 0.75)).toBe(0)
  })
})
