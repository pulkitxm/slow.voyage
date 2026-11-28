import { expect, test } from 'bun:test'
import { FrameGovernor, governorPlan, reliefLevels } from './governor'

const smooth = governorPlan.frame
const slow = 1 / 30
const crawl = 1 / 18

function run(governor: FrameGovernor, seconds: number, frame: number, capped = false) {
  const verdicts: string[] = []
  for (let time = 0; time < seconds; time += frame) {
    const verdict = governor.step(frame, false, capped, true)
    if (verdict) verdicts.push(verdict)
    if (verdict === 'fallback') break
  }
  return verdicts
}

function strain(governor: FrameGovernor) {
  for (let time = 0; time < 5; time += slow) if (governor.step(slow, false, false, true)) return
}

test('a steady sixty frames a second leaves the picture alone and reports its pace', () => {
  const governor = new FrameGovernor()
  expect(run(governor, 30, smooth)).toEqual([])
  expect(governor.scale).toBe(1)
  expect(governor.relief).toBe(reliefLevels.full)
  expect(governor.median).toBeCloseTo(smooth, 5)
  expect(governor.tail).toBeCloseTo(smooth, 5)
})

test('sustained slow frames lower the resolution before any effect is shed', () => {
  const governor = new FrameGovernor()
  expect(run(governor, 1.5, slow)).toEqual(['adjust'])
  expect(governor.scale).toBeLessThan(1)
  expect(governor.scale).toBeGreaterThanOrEqual(governorPlan.floor)
  expect(governor.relief).toBe(reliefLevels.full)
})

test('heavy strain reaches the resolution floor in a couple of steps', () => {
  const governor = new FrameGovernor()
  run(governor, 4, crawl)
  expect(governor.scale).toBe(governorPlan.floor)
})

test('at the floor the effects go one at a time and then the preset falls back', () => {
  const governor = new FrameGovernor()
  const seen: number[] = []
  let verdict: string | null = null
  for (let time = 0; time < 60 && verdict !== 'fallback'; time += slow) {
    verdict = governor.step(slow, false, false, true)
    if (verdict === 'adjust' && governor.scale === governorPlan.floor) seen.push(governor.relief)
  }
  expect(verdict).toBe('fallback')
  expect(seen.slice(-2)).toEqual([reliefLevels.flat, reliefLevels.plain])
})

test('comfortable frames bring the effects back first and then the resolution', () => {
  const governor = new FrameGovernor()
  for (let time = 0; time < 60 && governor.relief < reliefLevels.plain; time += slow)
    governor.step(slow, false, false, true)
  expect(run(governor, governorPlan.recovery - 1, smooth)).toEqual([])
  run(governor, 3, smooth)
  expect(governor.relief).toBe(reliefLevels.flat)
  expect(governor.scale).toBe(governorPlan.floor)
  run(governor, governorPlan.recovery + 2, smooth)
  expect(governor.relief).toBe(reliefLevels.full)
  run(governor, 60, smooth)
  expect(governor.scale).toBe(1)
})

test('a raise that brings the strain back makes the next attempt wait twice as long', () => {
  const governor = new FrameGovernor()
  strain(governor)
  const lowered = governor.scale
  run(governor, governorPlan.recovery + 2, smooth)
  expect(governor.scale).toBeGreaterThan(lowered)
  strain(governor)
  const settled = governor.scale
  expect(run(governor, governorPlan.recovery + 2, smooth)).toEqual([])
  expect(governor.scale).toBe(settled)
  expect(run(governor, governorPlan.recovery, smooth)).toEqual(['adjust'])
})

test('busy frames and the grace after a change are never held against the picture', () => {
  const governor = new FrameGovernor()
  for (let time = 0; time < 10; time += crawl)
    expect(governor.step(crawl, true, false, true)).toBeNull()
  governor.hold()
  expect(run(governor, governorPlan.grace - 0.2, crawl)).toEqual([])
  expect(governor.scale).toBe(1)
})

test('a single long stall does not change anything', () => {
  const governor = new FrameGovernor()
  run(governor, 2, smooth)
  expect(governor.step(2.5, false, false, true)).toBeNull()
  expect(run(governor, 5, smooth)).toEqual([])
  expect(governor.scale).toBe(1)
})

test('a display capped at thirty is tested once and then left at full quality', () => {
  const governor = new FrameGovernor()
  expect(run(governor, 1.2, slow, true)).toEqual(['adjust'])
  expect(governor.scale).toBe(governorPlan.floor)
  expect(governor.relief).toBe(reliefLevels.plain)
  expect(run(governor, 1.5, slow, true)).toEqual(['adjust'])
  expect(governor.scale).toBe(1)
  expect(governor.relief).toBe(reliefLevels.full)
  expect(run(governor, 60, slow, true)).toEqual([])
})

test('a preset that cannot win its effects back falls back instead of lingering', () => {
  const governor = new FrameGovernor()
  let time = 0
  let verdict: string | null = null
  for (; time < 600 && verdict !== 'fallback'; time += smooth) {
    const strained = governor.relief < reliefLevels.plain
    verdict = governor.step(strained ? slow : smooth, false, false, true)
  }
  expect(verdict).toBe('fallback')
})

test('measuring without governing only keeps the readout', () => {
  const governor = new FrameGovernor()
  for (let time = 0; time < 5; time += crawl)
    expect(governor.step(crawl, false, false, false)).toBeNull()
  expect(governor.median).toBeCloseTo(crawl, 5)
  expect(governor.scale).toBe(1)
})

function timed(governor: FrameGovernor, seconds: number, frame: number, load: number) {
  const verdicts: string[] = []
  for (let time = 0; time < seconds; time += frame) {
    const verdict = governor.step(frame, false, false, true, load)
    if (verdict) verdicts.push(verdict)
  }
  return verdicts
}

test('slow frames with an idle graphics card are not blamed on the picture', () => {
  const governor = new FrameGovernor()
  expect(timed(governor, 20, slow, 0.004)).toEqual([])
  expect(governor.scale).toBe(1)
  expect(governor.load).toBeCloseTo(0.004, 5)
})

test('a processor that cannot keep up asks for the lightest preset with the picture intact', () => {
  const governor = new FrameGovernor()
  expect(timed(governor, 30, crawl, 0.004)).toContain('lighten')
  expect(governor.scale).toBe(1)
  expect(governor.relief).toBe(reliefLevels.full)
})

test('a measured overload lowers the resolution straight to what fits', () => {
  const governor = new FrameGovernor()
  expect(timed(governor, 0.8, smooth, 0.026)).toEqual(['adjust'])
  expect(governor.scale).toBeLessThanOrEqual(0.7)
  expect(governor.scale).toBeGreaterThanOrEqual(governorPlan.floor)
})

test('a measured resolution only rises again when the graphics card has room to spare', () => {
  const governor = new FrameGovernor()
  timed(governor, 0.8, smooth, 0.026)
  const lowered = governor.scale
  expect(timed(governor, 20, smooth, governorPlan.frame * 0.7)).toEqual([])
  expect(governor.scale).toBe(lowered)
  timed(governor, governorPlan.recovery + 3, smooth, governorPlan.frame * 0.3)
  expect(governor.scale).toBeGreaterThan(lowered)
})
