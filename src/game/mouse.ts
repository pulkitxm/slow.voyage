import { neutralInput } from './controls'
import type { Input } from './physics'
import { clamp } from './world'

export class MouseControls {
  steer = 0
  buttons = 0
  move(clientX: number, width: number, sensitivity: number) {
    const previous = this.steer
    const value = clamp(
      ((width * 0.5 - clientX) / (Math.max(width * 0.5, 640) * 0.5)) * sensitivity,
      -1,
      1,
    )
    this.steer =
      Math.abs(value) <= 0.025 ? 0 : (Math.sign(value) * (Math.abs(value) - 0.025)) / 0.975
    return Math.abs(this.steer) > 0.02 && Math.abs(this.steer - previous) > 0.001
  }
  setButtons(buttons: number) {
    this.buttons = buttons
  }
  reset() {
    this.steer = this.buttons = 0
  }
  input(): Input {
    const brake = (this.buttons & 2) !== 0
    return {
      ...neutralInput,
      steer: this.steer,
      throttle: !brake && (this.buttons & 1) !== 0 ? 1 : 0,
      brake: brake ? 1 : 0,
    }
  }
}
