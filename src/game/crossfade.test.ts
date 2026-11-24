import { expect, test } from 'bun:test'
import { crossfadeTiming, veilReady } from './crossfade'

test('on a fast machine the veil lifts once the new scene has drawn its settling frames', () => {
  expect(veilReady(0, 0)).toBe(false)
  expect(veilReady(1, 17)).toBe(false)
  expect(veilReady(2, 34)).toBe(false)
  expect(veilReady(crossfadeTiming.settleFrames, 50)).toBe(true)
})

test('on a slow machine the veil lifts after one drawn frame and a short wait instead of three long frames', () => {
  expect(veilReady(0, 5000)).toBe(false)
  expect(veilReady(1, crossfadeTiming.settleTime - 1)).toBe(false)
  expect(veilReady(1, crossfadeTiming.settleTime)).toBe(true)
  expect(veilReady(2, 440)).toBe(true)
  expect(crossfadeTiming.settleTime).toBeGreaterThanOrEqual(200)
  expect(crossfadeTiming.settleTime).toBeLessThan(500)
})
