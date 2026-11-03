import type { PadSnapshot } from './gamepad'

export const controllerGroups = {
  Driving: {
    steerLeft: 'Steer left',
    steerRight: 'Steer right',
    throttle: 'Accelerate',
    brake: 'Brake / reverse',
    handbrake: 'Handbrake',
  },
  Shortcuts: {
    start: 'Start / resume',
    auto: 'Toggle assistance',
    autoMode: 'Choose assistance',
    pause: 'Pause',
    reset: 'Return to road',
    camera: 'Change camera',
    cruiseUp: 'Cruise faster',
    cruiseDown: 'Cruise slower',
    vehicleNext: 'Next vehicle',
    vehiclePrevious: 'Previous vehicle',
    journeyNext: 'Next scenery',
    journeyPrevious: 'Previous scenery',
  },
  Camera: {
    lookLeft: 'Look left',
    lookRight: 'Look right',
    lookUp: 'Look up',
    lookDown: 'Look down',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    cameraCenter: 'Center camera',
  },
} as const

export const controllerLabels = {
  ...controllerGroups.Driving,
  ...controllerGroups.Shortcuts,
  ...controllerGroups.Camera,
}
export type ControllerChannel = keyof typeof controllerLabels
export interface ControllerBinding {
  deviceId: string
  kind: 'axis' | 'button'
  index: number
  from: number
  to: number
}
export type ControllerBindings = Partial<Record<ControllerChannel, ControllerBinding>>
export type ControllerMode = 'standard' | 'custom'

export function readControl(
  pads: readonly (PadSnapshot | null)[],
  binding: Pick<ControllerBinding, 'deviceId' | 'kind' | 'index'>,
) {
  const matches = pads.filter(
    (pad): pad is PadSnapshot => !!pad?.connected && pad.id === binding.deviceId,
  )
  if (matches.length !== 1) return undefined
  const pad = matches[0]
  if (!pad) return undefined
  const value =
    binding.kind === 'axis' ? pad.axes[binding.index] : pad.buttons[binding.index]?.value
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(binding.kind === 'axis' ? -1 : 0, Math.min(1, value))
}

export function readBinding(
  pads: readonly (PadSnapshot | null)[],
  binding: ControllerBinding | undefined,
) {
  if (!binding) return 0
  const value = readControl(pads, binding)
  if (value === undefined) return 0
  return Math.max(0, Math.min(1, (value - binding.from) / (binding.to - binding.from)))
}

export function standardBindings(deviceId: string): ControllerBindings {
  const axis = (to: number): ControllerBinding => ({
    deviceId,
    kind: 'axis',
    index: 0,
    from: 0,
    to,
  })
  const button = (index: number): ControllerBinding => ({
    deviceId,
    kind: 'button',
    index,
    from: 0,
    to: 1,
  })
  return {
    steerLeft: axis(-1),
    steerRight: axis(1),
    throttle: button(7),
    brake: button(6),
    handbrake: button(1),
    start: button(0),
    auto: button(2),
    camera: button(3),
    autoMode: button(4),
    reset: button(8),
    pause: button(9),
    cruiseUp: button(12),
    cruiseDown: button(13),
  }
}

export function decodeBindings(value: unknown): ControllerBindings {
  const result: ControllerBindings = {}
  if (!value || typeof value !== 'object') return result
  for (const key of Object.keys(controllerLabels) as ControllerChannel[]) {
    const raw = (value as Record<string, unknown>)[key]
    if (!raw || typeof raw !== 'object') continue
    const binding = raw as Record<string, unknown>
    if (
      typeof binding.deviceId !== 'string' ||
      !binding.deviceId.length ||
      binding.deviceId.length > 512 ||
      (binding.kind !== 'axis' && binding.kind !== 'button')
    )
      continue
    if (
      typeof binding.index !== 'number' ||
      !Number.isInteger(binding.index) ||
      binding.index < 0 ||
      binding.index > (binding.kind === 'axis' ? 63 : 255)
    )
      continue
    if (
      typeof binding.from !== 'number' ||
      typeof binding.to !== 'number' ||
      !Number.isFinite(binding.from) ||
      !Number.isFinite(binding.to)
    )
      continue
    const minimum = binding.kind === 'axis' ? -1 : 0
    if (
      binding.from < minimum ||
      binding.from > 1 ||
      binding.to < minimum ||
      binding.to > 1 ||
      Math.abs(binding.to - binding.from) < 0.05
    )
      continue
    result[key] = {
      deviceId: binding.deviceId,
      kind: binding.kind,
      index: binding.index,
      from: binding.from,
      to: binding.to,
    }
  }
  return result
}
