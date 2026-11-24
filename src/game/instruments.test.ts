import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { createInstrumentMaterials, createSpeedometer } from './instruments'

test.each([140, 220])(
  '%i km/h speedometer agrees with physical speed in either direction',
  (range) => {
    const theme = createInstrumentMaterials()
    const instrument = createSpeedometer(0.08, range, theme)
    instrument.update(0)
    expect(instrument.needle.rotation.y).toBeCloseTo((Math.PI * 2) / 3, 8)
    instrument.update(range / 2 / 3.6)
    expect(instrument.needle.rotation.y).toBeCloseTo(0, 8)
    instrument.update(-range / 2 / 3.6)
    expect(instrument.needle.rotation.y).toBeCloseTo(0, 8)
    instrument.update(range / 3.6)
    expect(instrument.needle.rotation.y).toBeCloseTo((-Math.PI * 2) / 3, 8)
    instrument.update(range)
    expect(instrument.needle.rotation.y).toBeCloseTo((-Math.PI * 2) / 3, 8)
    instrument.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    for (const material of theme.materials) material.dispose()
  },
)

test('printed dial is drawn from the first frame so its texture never loads late', () => {
  const idle = () => {}
  const context = {
    fillStyle: '',
    translate: idle,
    scale: idle,
    rotate: idle,
    save: idle,
    restore: idle,
    fillRect: idle,
    beginPath: idle,
    moveTo: idle,
    lineTo: idle,
    closePath: idle,
    fill: idle,
    getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) }),
  }
  const canvas = { width: 0, height: 0, getContext: () => context }
  Object.assign(globalThis, { document: { createElement: () => canvas } })
  const theme = createInstrumentMaterials()
  const instrument = createSpeedometer(0.08, 140, theme, true)
  Reflect.deleteProperty(globalThis, 'document')
  const dial = instrument.group.getObjectByName('printed-dial')
  expect(dial).toBeInstanceOf(THREE.Mesh)
  expect(dial?.frustumCulled).toBe(false)
  instrument.group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose()
  })
  for (const material of theme.materials) material.dispose()
})
