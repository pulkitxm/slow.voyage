import { neutralInput } from './controls'
import type { Input } from './physics'
import { clamp } from './world'

export type ControllerStatus = 'none' | 'connected' | 'unsupported' | 'unavailable'
export type GamepadAction =
  | 'start'
  | 'pause'
  | 'auto'
  | 'camera'
  | 'reset'
  | 'autoMode'
  | 'cruiseUp'
  | 'cruiseDown'
export type PadSnapshot = Pick<Gamepad, 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'>
const buttonActions: [number, GamepadAction][] = [
  [0, 'start'],
  [2, 'auto'],
  [3, 'camera'],
  [4, 'autoMode'],
  [8, 'reset'],
  [9, 'pause'],
  [12, 'cruiseUp'],
  [13, 'cruiseDown'],
]

function finite(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? value : 0
}
function trigger(pad: PadSnapshot, index: number) {
  return clamp((finite(pad.buttons[index]?.value) - 0.04) / 0.96, 0, 1)
}
function pressed(pad: PadSnapshot, index: number) {
  return (pad.buttons[index]?.pressed ?? false) || finite(pad.buttons[index]?.value) > 0.5
}
export function decodeGamepad(pad: PadSnapshot, deadzone: number): Input {
  const axis = clamp(finite(pad.axes[0]), -1, 1)
  const steer =
    Math.abs(axis) <= deadzone
      ? 0
      : (-Math.sign(axis) * (Math.abs(axis) - deadzone)) / (1 - deadzone)
  return {
    ...neutralInput,
    throttle: trigger(pad, 7),
    brake: trigger(pad, 6),
    steer,
    steeringSource: 'analog',
    handbrake: pressed(pad, 1),
  }
}

export class GamepadControls {
  index: number | null = null
  previous: Input = { ...neutralInput }
  activity: Input = { ...neutralInput }
  buttons = new Set<number>()
  waitingForRelease = false
  suspend() {
    this.waitingForRelease = true
    this.previous = { ...neutralInput }
    this.activity = { ...neutralInput }
    this.buttons.clear()
  }
  read(pads: readonly (PadSnapshot | null)[], deadzone: number) {
    const supported = pads.filter(
      (pad): pad is PadSnapshot => !!pad?.connected && pad.mapping === 'standard',
    )
    const pad = supported.find((candidate) => candidate.index === this.index) ?? supported[0]
    const status: ControllerStatus = pad
      ? 'connected'
      : pads.some((candidate) => candidate?.connected)
        ? 'unsupported'
        : 'none'
    const empty = {
      input: { ...neutralInput },
      actions: [] as GamepadAction[],
      steerActive: false,
      pedalsActive: false,
      handbrakeActive: false,
      status,
    }
    if (!pad) {
      if (this.index !== null) this.waitingForRelease = true
      this.index = null
      this.previous = { ...neutralInput }
      this.activity = { ...neutralInput }
      this.buttons.clear()
      return empty
    }
    if (this.index !== pad.index) {
      if (this.index !== null) this.waitingForRelease = true
      this.index = pad.index
      this.previous = { ...neutralInput }
      this.activity = { ...neutralInput }
      this.buttons.clear()
    }
    const input = decodeGamepad(pad, deadzone)
    const buttons = new Set(pad.buttons.flatMap((_, index) => (pressed(pad, index) ? [index] : [])))
    if (this.waitingForRelease) {
      if (!input.steer && !input.throttle && !input.brake && !buttons.size)
        this.waitingForRelease = false
      this.buttons = buttons
      this.previous = input
      return empty
    }
    const actions = buttonActions
      .filter(([index]) => buttons.has(index) && !this.buttons.has(index))
      .map(([, action]) => action)
    const steerActive =
      Math.abs(input.steer) > 0.02 &&
      (Math.abs(this.previous.steer) <= 0.02 || Math.abs(input.steer - this.activity.steer) > 0.08)
    const pedalsActive =
      (input.throttle > 0 &&
        (this.previous.throttle === 0 ||
          Math.abs(input.throttle - this.activity.throttle) > 0.08)) ||
      (input.brake > 0 &&
        (this.previous.brake === 0 || Math.abs(input.brake - this.activity.brake) > 0.08))
    const handbrakeActive = input.handbrake && !this.previous.handbrake
    if (steerActive || Math.abs(input.steer) <= 0.02) this.activity.steer = input.steer
    if (pedalsActive || !input.throttle) this.activity.throttle = input.throttle
    if (pedalsActive || !input.brake) this.activity.brake = input.brake
    this.buttons = buttons
    this.previous = input
    return { input, actions, steerActive, pedalsActive, handbrakeActive, status }
  }
}
