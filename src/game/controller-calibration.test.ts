import { expect, test } from 'bun:test'
import { advanceCalibration, beginCalibration, finishCalibration } from './controller-calibration'
import type { PadSnapshot } from './gamepad'

function pad(axes: number[], buttons: number[] = [], index = 0): PadSnapshot {
  return {
    id: 'Portable controls',
    index,
    connected: true,
    mapping: '',
    axes,
    buttons: buttons.map((value) => ({ value, pressed: value > 0.5, touched: value > 0 })),
  }
}

test('inverted pedal calibration measures full travel and requires release before saving', () => {
  const baseline = beginCalibration([pad([1])])
  if (!baseline) throw new Error('Calibration unavailable')
  let state = advanceCalibration(baseline, [pad([0.6])])
  state = advanceCalibration(state, [pad([-0.85])])
  expect(finishCalibration(state)).toBe(null)
  state = advanceCalibration(state, [pad([1], [], 7)])
  expect(finishCalibration(state)).toEqual({
    deviceId: 'Portable controls',
    kind: 'axis',
    index: 0,
    from: 1,
    to: -0.85,
  })
})

test('calibration ignores small drift and does not reverse the learned direction', () => {
  const baseline = beginCalibration([pad([0.04])])
  if (!baseline) throw new Error('Calibration unavailable')
  expect(advanceCalibration(baseline, [pad([0.09])]).binding).toBe(null)
  let state = advanceCalibration(baseline, [pad([-0.3])])
  state = advanceCalibration(state, [pad([-0.8])])
  state = advanceCalibration(state, [pad([1])])
  expect(state.binding?.to).toBe(-0.8)
  expect(finishCalibration(state)).toBe(null)
  state = advanceCalibration(state, [pad([0.04])])
  expect(finishCalibration(state)?.to).toBe(-0.8)
})

test('buttons must be released before capture and can be bound after a complete press', () => {
  expect(beginCalibration([pad([], [1])])).toBe(null)
  const baseline = beginCalibration([pad([], [0])])
  if (!baseline) throw new Error('Calibration unavailable')
  let state = advanceCalibration(baseline, [pad([], [1])])
  expect(finishCalibration(state)).toBe(null)
  state = advanceCalibration(state, [pad([], [0])])
  expect(finishCalibration(state)).toEqual({
    deviceId: 'Portable controls',
    kind: 'button',
    index: 0,
    from: 0,
    to: 1,
  })
})

test('a missing or ambiguous device cannot silently complete calibration', () => {
  expect(beginCalibration([])).toBe(null)
  expect(beginCalibration([pad([0]), pad([0], [], 1)])).toBe(null)
  const baseline = beginCalibration([pad([0])])
  if (!baseline) throw new Error('Calibration unavailable')
  expect(advanceCalibration(baseline, []).lost).toBe(true)
  const active = advanceCalibration(baseline, [pad([-1])])
  for (const pads of [[], [pad([0]), pad([0], [], 1)]]) {
    const state = advanceCalibration(active, pads)
    expect(state.lost).toBe(true)
    expect(finishCalibration(state)).toBe(null)
  }
})
