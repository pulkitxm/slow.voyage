import { expect, test } from 'bun:test'
import { decodeGamepad, GamepadControls } from './gamepad'

function pad(index = 0) {
  return {
    id: 'Portable test controller',
    index,
    connected: true,
    mapping: 'standard' as GamepadMappingType,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
  }
}
function button(
  controller: ReturnType<typeof pad>,
  index: number,
  value: number,
  pressed = value > 0.5,
) {
  const target = controller.buttons[index]
  if (!target) throw new Error('Missing controller button')
  target.value = value
  target.pressed = pressed
}

test('standard analog triggers retain pressure even when pressed is false', () => {
  const controller = pad()
  controller.axes[0] = -0.56
  button(controller, 7, 0.52, false)
  button(controller, 6, 0.28, false)
  const input = decodeGamepad(controller, 0.12)
  expect(input.throttle).toBeCloseTo(0.5, 8)
  expect(input.brake).toBeCloseTo(0.25, 8)
  expect(input.steer).toBeCloseTo(0.5, 8)
})

test('stick and trigger drift produce no driving input', () => {
  const controller = pad()
  controller.axes[0] = 0.1
  button(controller, 7, 0.03)
  const input = decodeGamepad(controller, 0.12)
  expect(input.throttle).toBe(0)
  expect(input.steer).toBe(0)
})

test('button actions fire once per press rather than once per frame', () => {
  const controller = pad(),
    reader = new GamepadControls()
  button(controller, 2, 1)
  expect(reader.read([controller], 0.12).actions).toEqual(['auto'])
  expect(reader.read([controller], 0.12).actions).toEqual([])
  button(controller, 2, 0)
  reader.read([controller], 0.12)
  button(controller, 2, 1)
  expect(reader.read([controller], 0.12).actions).toEqual(['auto'])
})

test('unchanged held input does not repeatedly take over an assisted axis', () => {
  const controller = pad(),
    reader = new GamepadControls()
  button(controller, 7, 1)
  expect(reader.read([controller], 0.12).pedalsActive).toBe(true)
  expect(reader.read([controller], 0.12).pedalsActive).toBe(false)
  button(controller, 7, 0)
  reader.read([controller], 0.12)
  button(controller, 7, 1)
  expect(reader.read([controller], 0.12).pedalsActive).toBe(true)
})

test('gradual stick and trigger movement releases assistance without requiring a sudden jump', () => {
  const controller = pad(),
    reader = new GamepadControls()
  reader.read([controller], 0.12)
  let steeringHandoffs = 0
  for (let i = 1; i <= 100; i++) {
    controller.axes[0] = -i / 100
    if (reader.read([controller], 0.12).steerActive) steeringHandoffs++
  }
  expect(steeringHandoffs).toBeGreaterThan(0)
  expect(reader.read([controller], 0.12).steerActive).toBe(false)
  button(controller, 7, 0.25)
  reader.read([controller], 0.12)
  let pedalHandoffs = 0
  for (let i = 26; i <= 75; i++) {
    button(controller, 7, i / 100)
    if (reader.read([controller], 0.12).pedalsActive) pedalHandoffs++
  }
  expect(pedalHandoffs).toBeGreaterThan(0)
  expect(reader.read([controller], 0.12).pedalsActive).toBe(false)
})

test('disconnect clears driving input and reconnect requires release of held controls', () => {
  const controller = pad(),
    reader = new GamepadControls()
  button(controller, 7, 1)
  expect(reader.read([controller], 0.12).input.throttle).toBe(1)
  const lost = reader.read([], 0.12)
  expect(lost.status).toBe('none')
  expect(lost.input.throttle).toBe(0)
  expect(reader.read([controller], 0.12).input.throttle).toBe(0)
  button(controller, 7, 0)
  reader.read([controller], 0.12)
  button(controller, 7, 1)
  expect(reader.read([controller], 0.12).input.throttle).toBe(1)
})

test('focus suspension suppresses held actions until all controls return to neutral', () => {
  const controller = pad(),
    reader = new GamepadControls()
  button(controller, 9, 1)
  reader.read([controller], 0.12)
  reader.suspend()
  expect(reader.read([controller], 0.12).actions).toEqual([])
  button(controller, 9, 0)
  reader.read([controller], 0.12)
  button(controller, 9, 1)
  expect(reader.read([controller], 0.12).actions).toEqual(['pause'])
})

test('unmapped devices are reported without interpreting their controls', () => {
  const controller = pad(),
    reader = new GamepadControls()
  controller.mapping = ''
  button(controller, 7, 1)
  const frame = reader.read([null, controller], 0.12)
  expect(frame.status).toBe('unsupported')
  expect(frame.input.throttle).toBe(0)
  expect(frame.actions).toEqual([])
})
