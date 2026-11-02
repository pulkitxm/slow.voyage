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
