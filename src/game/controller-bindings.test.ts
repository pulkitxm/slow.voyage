import { expect, test } from 'bun:test'
import { type ControllerBinding, decodeBindings, readBinding } from './controller-bindings'
import { GamepadControls, type PadSnapshot } from './gamepad'

function pad(id: string, index: number, axes: number[], buttons: number[] = []): PadSnapshot {
  return {
    id,
    index,
    connected: true,
    mapping: '',
    axes,
    buttons: buttons.map((value) => ({ value, pressed: value > 0.5, touched: value > 0 })),
  }
}
const steering: ControllerBinding = {
  deviceId: 'Portable wheel',
  kind: 'axis',
  index: 0,
  from: 0.04,
  to: -0.86,
}
const accelerator: ControllerBinding = {
  deviceId: 'Portable pedals',
  kind: 'axis',
  index: 1,
  from: 1,
  to: -1,
}

test('measured ranges normalize inverted pedals and asymmetric steering without relying on slots', () => {
  const pads = [pad('Portable wheel', 5, [-0.41]), pad('Portable pedals', 2, [0, 0])]
  expect(readBinding(pads, steering)).toBeCloseTo(0.5, 8)
  expect(readBinding(pads, accelerator)).toBe(0.5)
  expect(readBinding([pad('Portable wheel', 0, [-1])], steering)).toBe(1)
  expect(readBinding([pad('Portable wheel', 0, [0.1])], steering)).toBe(0)
})

test('missing, invalid and ambiguous physical sources are neutral', () => {
  for (const pads of [
    [],
    [pad('Other wheel', 0, [-1])],
    [pad('Portable wheel', 0, [Number.NaN])],
    [pad('Portable wheel', 0, [-1]), pad('Portable wheel', 1, [-1])],
  ])
    expect(readBinding(pads, steering)).toBe(0)
})

test('custom steering and pedals can come from separate unmapped devices', () => {
  const bindings = { steerLeft: steering, throttle: accelerator }
  const reader = new GamepadControls()
  reader.read([pad('Portable wheel', 5, [0.04]), pad('Portable pedals', 2, [0, 1])], 0.12, bindings)
  const frame = reader.read(
    [pad('Portable wheel', 5, [-0.41]), pad('Portable pedals', 2, [0, 0])],
    0.12,
    bindings,
  )
  expect(frame.status).toBe('connected')
  expect(frame.input.steer).toBeCloseTo((0.5 - 0.12) / 0.88, 8)
  expect(frame.input.throttle).toBeCloseTo((0.5 - 0.04) / 0.96, 8)
  expect(frame.steerActive).toBe(true)
  expect(frame.pedalsActive).toBe(true)
})

test('reindexing a saved device requires release but keeps its binding', () => {
  const reader = new GamepadControls()
  const bindings = { throttle: accelerator }
  expect(reader.read([pad('Portable pedals', 2, [0, -1])], 0.12, bindings).input.throttle).toBe(0)
  reader.read([pad('Portable pedals', 2, [0, 1])], 0.12, bindings)
  expect(reader.read([pad('Portable pedals', 2, [0, -1])], 0.12, bindings).input.throttle).toBe(1)
  expect(reader.read([pad('Portable pedals', 7, [0, -1])], 0.12, bindings).input.throttle).toBe(0)
  reader.read([pad('Portable pedals', 7, [0, 1])], 0.12, bindings)
  expect(reader.read([pad('Portable pedals', 7, [0, -1])], 0.12, bindings).input.throttle).toBe(1)
})

test('mapping changes and opposed held buttons cannot bypass the neutral gate', () => {
  const reader = new GamepadControls()
  const button = (index: number): ControllerBinding => ({
    deviceId: 'Portable buttons',
    kind: 'button',
    index,
    from: 0,
    to: 1,
  })
  reader.read([pad('Portable buttons', 0, [], [1, 1])], 0.12)
  const bindings = { steerLeft: button(0), steerRight: button(1) }
  expect(reader.read([pad('Portable buttons', 0, [], [1, 1])], 0.12, bindings).input.steer).toBe(0)
  expect(reader.waitingForRelease).toBe(true)
  reader.read([pad('Portable buttons', 0, [], [0, 0])], 0.12, bindings)
  expect(reader.read([pad('Portable buttons', 0, [], [1, 0])], 0.12, bindings).input.steer).toBe(1)
})

test('mapped axes produce one shortcut edge and camera motion stays separate from driving', () => {
  const reader = new GamepadControls()
  const binding: ControllerBinding = {
    deviceId: 'Portable wheel',
    kind: 'axis',
    index: 0,
    from: 0,
    to: 1,
  }
  const bindings = { camera: binding, lookLeft: binding }
  reader.read([pad('Portable wheel', 0, [0])], 0.12, bindings)
  const first = reader.read([pad('Portable wheel', 0, [0.8])], 0.12, bindings)
  expect(first.actions).toEqual(['camera'])
  expect(first.look.x).toBeGreaterThan(0)
  expect(first.steerActive).toBe(false)
  expect(first.pedalsActive).toBe(false)
  expect(reader.read([pad('Portable wheel', 0, [0.8])], 0.12, bindings).actions).toEqual([])
})

test('saved bindings reject malformed endpoints, device identifiers and indices', () => {
  expect(decodeBindings({ steerLeft: steering, throttle: accelerator })).toEqual({
    steerLeft: steering,
    throttle: accelerator,
  })
  for (const invalid of [
    { ...steering, from: Number.NaN },
    { ...steering, to: steering.from },
    { ...steering, index: -1 },
    { ...steering, index: 0.5 },
    { ...steering, index: 64 },
    { ...steering, deviceId: '' },
    { ...steering, kind: 'key' },
    { ...steering, to: 2 },
  ])
    expect(decodeBindings({ steerLeft: invalid })).toEqual({})
  expect(decodeBindings({ extra: steering })).toEqual({})
})

test('noisy shortcut axes use hysteresis and need calibrated rest after suspension', () => {
  const reader = new GamepadControls()
  const bindings = {
    pause: { deviceId: 'Portable wheel', kind: 'axis' as const, index: 0, from: 0, to: 1 },
  }
  reader.read([pad('Portable wheel', 0, [0])], 0.12, bindings)
  expect(reader.read([pad('Portable wheel', 0, [0.7])], 0.12, bindings).actions).toEqual(['pause'])
  for (const value of [0.49, 0.51, 0.49, 0.51])
    expect(reader.read([pad('Portable wheel', 0, [value])], 0.12, bindings).actions).toEqual([])
  reader.suspend()
  for (const value of [0.49, 0.51, 0.2]) {
    expect(reader.read([pad('Portable wheel', 0, [value])], 0.12, bindings).actions).toEqual([])
    expect(reader.waitingForRelease).toBe(true)
  }
  reader.read([pad('Portable wheel', 0, [0])], 0.12, bindings)
  expect(reader.read([pad('Portable wheel', 0, [0.7])], 0.12, bindings).actions).toEqual(['pause'])
})
