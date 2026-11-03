import {
  type ControllerBindings,
  type ControllerChannel,
  controllerGroups,
  controllerLabels,
  readBinding,
  standardBindings,
} from './controller-bindings'
import { neutralInput } from './controls'
import type { Input } from './physics'
import { clamp } from './world'

export type ControllerStatus = 'none' | 'connected' | 'unsupported' | 'unavailable'
export type GamepadAction = keyof typeof controllerGroups.Shortcuts | 'cameraCenter'
export type PadSnapshot = Pick<
  Gamepad,
  'id' | 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'
>
export interface ControllerLook {
  x: number
  y: number
  zoom: number
}
const actionChannels: GamepadAction[] = [
  ...(Object.keys(controllerGroups.Shortcuts) as GamepadAction[]),
  'cameraCenter',
]

function deadzoneValue(value: number, deadzone: number) {
  return Math.abs(value) <= deadzone
    ? 0
    : (Math.sign(value) * (Math.abs(value) - deadzone)) / (1 - deadzone)
}
function decodeController(
  pads: readonly (PadSnapshot | null)[],
  deadzone: number,
  bindings: ControllerBindings,
  heldActions: ReadonlySet<GamepadAction>,
  handbrakeHeld: boolean,
) {
  const values = {} as Record<ControllerChannel, number>
  for (const key of Object.keys(controllerLabels) as ControllerChannel[])
    values[key] = readBinding(pads, bindings[key])
  const input: Input = {
    ...neutralInput,
    throttle: clamp((values.throttle - 0.04) / 0.96, 0, 1),
    brake: clamp((values.brake - 0.04) / 0.96, 0, 1),
    steer: deadzoneValue(values.steerLeft - values.steerRight, deadzone),
    steeringSource: 'analog',
    handbrake: values.handbrake >= (handbrakeHeld ? 0.35 : 0.55),
  }
  const look = {
    x: deadzoneValue(values.lookLeft - values.lookRight, deadzone),
    y: deadzoneValue(values.lookUp - values.lookDown, deadzone),
    zoom: deadzoneValue(values.zoomIn - values.zoomOut, deadzone),
  }
  const actions = new Set(
    actionChannels.filter((channel) => values[channel] >= (heldActions.has(channel) ? 0.35 : 0.55)),
  )
  const neutral =
    !input.throttle &&
    !input.brake &&
    values.handbrake <= 0.1 &&
    actionChannels.every((channel) => values[channel] <= 0.1) &&
    Math.max(
      values.steerLeft,
      values.steerRight,
      values.lookLeft,
      values.lookRight,
      values.lookUp,
      values.lookDown,
      values.zoomIn,
      values.zoomOut,
    ) <= deadzone
  return { input, look, actions, neutral }
}

export function decodeGamepad(pad: PadSnapshot, deadzone: number): Input {
  return decodeController([pad], deadzone, standardBindings(pad.id), new Set(), false).input
}

export class GamepadControls {
  previous: Input = { ...neutralInput }
  activity: Input = { ...neutralInput }
  actions = new Set<GamepadAction>()
  waitingForRelease = false
  private identity: string | null = null
  private bindings: ControllerBindings | null | undefined
  private deadzone = 0
  private standardId: string | null = null
  private standardMap: ControllerBindings = {}
  private standardIndex: number | null = null
  private hasDevice = false

  suspend() {
    this.waitingForRelease = true
    this.previous = { ...neutralInput }
    this.activity = { ...neutralInput }
    this.actions.clear()
  }
  read(
    pads: readonly (PadSnapshot | null)[],
    deadzone: number,
    bindings: ControllerBindings | null = null,
  ) {
    const connected = pads.filter((pad): pad is PadSnapshot => !!pad?.connected)
    const supported = connected.filter((pad) => pad.mapping === 'standard')
    const standard = supported.find((pad) => pad.index === this.standardIndex) ?? supported[0]
    if (standard) {
      this.standardIndex = standard.index
      if (standard.id !== this.standardId) {
        this.standardId = standard.id
        this.standardMap = standardBindings(standard.id)
      }
    } else this.standardIndex = null
    const sources = new Set(Object.values(bindings ?? {}).map((binding) => binding.deviceId))
    const active =
      bindings === null
        ? standard
          ? [standard]
          : []
        : connected.filter(
            (pad) =>
              sources.has(pad.id) && connected.filter((other) => other.id === pad.id).length === 1,
          )
    const identity = JSON.stringify(active.map((pad) => [pad.id, pad.index, pad.mapping]).sort())
    if (
      (this.identity === null && bindings !== null) ||
      (this.identity !== null &&
        ((this.hasDevice && identity !== this.identity) ||
          bindings !== this.bindings ||
          deadzone !== this.deadzone))
    )
      this.suspend()
    if (active.length) this.hasDevice = true
    this.identity = identity
    this.bindings = bindings
    this.deadzone = deadzone
    const status: ControllerStatus = active.length
      ? 'connected'
      : connected.length
        ? 'unsupported'
        : 'none'
    const empty = {
      input: { ...neutralInput },
      look: { x: 0, y: 0, zoom: 0 },
      actions: [] as GamepadAction[],
      steerActive: false,
      pedalsActive: false,
      handbrakeActive: false,
      status,
    }
    if (!active.length) {
      this.previous = { ...neutralInput }
      this.activity = { ...neutralInput }
      this.actions.clear()
      return empty
    }
    const frame = decodeController(
      bindings === null ? active : connected,
      deadzone,
      bindings ?? this.standardMap,
      this.actions,
      this.previous.handbrake,
    )
    if (this.waitingForRelease) {
      if (frame.neutral) this.waitingForRelease = false
      this.actions = frame.actions
      this.previous = frame.input
      return empty
    }
    const { input, look, actions } = frame
    const pressed = [...actions].filter((action) => !this.actions.has(action))
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
    this.actions = actions
    this.previous = input
    return { input, look, actions: pressed, steerActive, pedalsActive, handbrakeActive, status }
  }
}
