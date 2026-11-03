import { type ControllerBinding, readControl } from './controller-bindings'
import type { PadSnapshot } from './gamepad'

type ControlSample = Pick<ControllerBinding, 'deviceId' | 'kind' | 'index'> & { value: number }
export interface ControllerCalibration {
  baseline: readonly ControlSample[]
  binding: ControllerBinding | null
  value: number
  released: boolean
  lost: boolean
}

export function beginCalibration(
  pads: readonly (PadSnapshot | null)[],
): ControllerCalibration | null {
  const baseline: ControlSample[] = []
  for (const pad of pads) {
    if (
      !pad?.connected ||
      !pad.id.length ||
      pads.filter((other) => other?.connected && other.id === pad.id).length !== 1
    )
      continue
    for (const kind of ['axis', 'button'] as const) {
      const count = Math.min(
        kind === 'axis' ? pad.axes.length : pad.buttons.length,
        kind === 'axis' ? 64 : 256,
      )
      for (let index = 0; index < count; index++) {
        const control = { deviceId: pad.id, kind, index }
        const value = readControl(pads, control)
        if (value !== undefined) baseline.push({ ...control, value })
      }
    }
  }
  if (!baseline.length || baseline.some((sample) => sample.kind === 'button' && sample.value > 0.1))
    return null
  return { baseline, binding: null, value: 0, released: false, lost: false }
}

export function advanceCalibration(
  state: ControllerCalibration,
  pads: readonly (PadSnapshot | null)[],
): ControllerCalibration {
  if (state.lost) return state
  const devices = new Set(state.baseline.map((control) => control.deviceId))
  if ([...devices].some((id) => pads.filter((pad) => pad?.connected && pad.id === id).length !== 1))
    return { ...state, lost: true, released: false }
  let binding = state.binding
  if (!binding) {
    let movement = 0.15
    for (const control of state.baseline) {
      const value = readControl(pads, control)
      if (value === undefined || Math.abs(value - control.value) <= movement) continue
      movement = Math.abs(value - control.value)
      binding = {
        deviceId: control.deviceId,
        kind: control.kind,
        index: control.index,
        from: control.value,
        to: value,
      }
    }
  }
  if (!binding) return state
  const value = readControl(pads, binding)
  if (value === undefined) return { ...state, binding, lost: true, released: false }
  if (
    (value - binding.from) * (binding.to - binding.from) > 0 &&
    Math.abs(value - binding.from) > Math.abs(binding.to - binding.from)
  )
    binding = { ...binding, to: value }
  return {
    ...state,
    binding,
    value,
    released: Math.abs(value - binding.from) <= Math.abs(binding.to - binding.from) * 0.08,
  }
}

export function finishCalibration(state: ControllerCalibration): ControllerBinding | null {
  return !state.lost &&
    state.released &&
    state.binding &&
    Math.abs(state.binding.to - state.binding.from) >= 0.15
    ? { ...state.binding }
    : null
}
