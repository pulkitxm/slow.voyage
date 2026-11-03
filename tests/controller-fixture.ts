export const controllerFixture = `
const virtualPad = {
  id: 'Portable test controller',
  index: 0,
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
};
Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => {
  document.documentElement.dataset.fixturePadNeutral = virtualPad.axes.every(value => value === 0) && virtualPad.buttons.every(button => button.value === 0) ? 'yes' : 'no';
  return virtualPad.connected ? [virtualPad] : [];
} });
window.addEventListener('keydown', (event) => {
  if (!event.code.startsWith('Digit') && !['KeyJ', 'KeyK'].includes(event.code)) return;
  for (const button of virtualPad.buttons) { button.value = 0; button.pressed = false; }
  virtualPad.axes.fill(0);
  const press = (index) => { virtualPad.buttons[index].value = 1; virtualPad.buttons[index].pressed = true; };
  if (event.code === 'Digit1') press(7);
  if (event.code === 'KeyJ') press(5);
  if (event.code === 'KeyK') { press(7); press(5); }
  if (event.code === 'Digit2') virtualPad.axes[0] = -0.7;
  if (event.code === 'Digit3') press(2);
  if (event.code === 'Digit4') press(3);
  if (event.code === 'Digit5') virtualPad.connected = false;
  if (event.code === 'Digit6') { virtualPad.connected = true; virtualPad.mapping = 'standard'; }
  if (event.code === 'Digit7') press(9);
  if (event.code === 'Digit8') virtualPad.mapping = '';
  if (event.code === 'Digit9') {
    const canvas = document.querySelector('canvas');
    const area = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: area.left + area.width * 0.25, clientY: area.top + area.height * 0.5 }));
  }
});
`
