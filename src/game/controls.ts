import type { Input } from './physics'
import type { AssistanceMode } from './world'

export const assistanceLabels: Record<AssistanceMode, string> = {
  off: 'Manual',
  full: 'Autodrive',
  steer: 'Autosteer',
  speed: 'Autospeed',
}
export const neutralInput: Readonly<Input> = {
  throttle: 0,
  brake: 0,
  steer: 0,
  steeringSource: null,
  handbrake: false,
  regenBrake: 0,
}

export function mergeManualInput(
  keyboard: Input,
  touch: Input,
  controller: Input,
  mouse: Input | null,
): Input {
  const device = mouse ?? controller
  const steering =
    keyboard.steer || keyboard.steeringSource === 'digital'
      ? keyboard
      : touch.steer || touch.steeringSource === 'digital'
        ? touch
        : device.steer
          ? device
          : mouse
  return {
    throttle: Math.max(keyboard.throttle, touch.throttle, device.throttle),
    brake: Math.max(keyboard.brake, touch.brake, device.brake),
    steer: steering?.steer ?? 0,
    steeringSource: steering?.steeringSource ?? null,
    handbrake: keyboard.handbrake || touch.handbrake || device.handbrake,
    regenBrake: 0,
  }
}

export function releaseAssistance(
  mode: AssistanceMode,
  axis: 'steer' | 'speed' | 'all',
): AssistanceMode {
  const steer = (mode === 'full' || mode === 'steer') && axis !== 'steer' && axis !== 'all'
  const speed = (mode === 'full' || mode === 'speed') && axis !== 'speed' && axis !== 'all'
  return steer ? (speed ? 'full' : 'steer') : speed ? 'speed' : 'off'
}

export function resolveInput(
  manual: Input,
  automatic: Input,
  mode: AssistanceMode,
  onePedal: boolean,
): Input {
  const steer = mode === 'full' || mode === 'steer'
  const speed = mode === 'full' || mode === 'speed'
  return {
    throttle: speed ? automatic.throttle : manual.throttle,
    brake: speed ? automatic.brake : manual.brake,
    steer: steer ? automatic.steer : manual.steer,
    steeringSource: steer ? automatic.steeringSource : manual.steeringSource,
    handbrake: manual.handbrake,
    regenBrake: !speed && onePedal && !manual.throttle && !manual.brake ? 0.15 : 0,
  }
}
