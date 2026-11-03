export const mappingFixture = `
const makePad = (id, index, mapping, axes) => ({ id, index, mapping, connected: true, axes, buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) });
const wheel = makePad('Portable wheel', 0, '', [0, 0]);
const pedals = makePad('Portable pedals', 1, '', [1, -1]);
const gamepad = makePad('Portable gamepad', 2, 'standard', [0, 0, 0, 0]);
const devices = [wheel, pedals, gamepad];
Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => {
  const pads = [];
  for (const pad of devices) if (pad.connected) pads[pad.index] = pad;
  return pads;
} });
const neutral = () => {
  wheel.axes.fill(0);
  pedals.axes[0] = 1;
  pedals.axes[1] = -1;
  gamepad.axes.fill(0);
  for (const pad of devices) for (const button of pad.buttons) { button.value = 0; button.pressed = false; }
};
const press = (pad, index) => { pad.buttons[index].value = 1; pad.buttons[index].pressed = true; };
window.addEventListener('keydown', event => {
  if (event.code === 'Digit7') { wheel.index = 7; pedals.index = 4; return; }
  if (event.code === 'Digit8') { pedals.connected = false; return; }
  if (event.code === 'Digit9') { pedals.connected = true; pedals.index = 5; return; }
  if (!['Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyB', 'KeyI', 'KeyO'].includes(event.code)) return;
  neutral();
  if (event.code === 'Digit1') wheel.axes[0] = -0.9;
  if (event.code === 'Digit2') wheel.axes[0] = 0.8;
  if (event.code === 'Digit3') pedals.axes[0] = -1;
  if (event.code === 'Digit4') pedals.axes[1] = 1;
  if (event.code === 'Digit5') press(wheel, 2);
  if (event.code === 'Digit6') wheel.axes[1] = -1;
  if (event.code === 'KeyB') press(wheel, 1);
  if (event.code === 'KeyI') press(gamepad, 7);
});
`
