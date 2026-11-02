import { expect, test } from 'bun:test'
import { rockSample, rockTexture } from './rock'

test('rock facets repeat continuously across texture joins in both directions', () => {
  for (const u of [-1.1, -0.001, 0, 0.1, 0.52, 0.999, 1.2])
    for (const v of [-0.2, 0, 0.25, 0.9, 1.001]) {
      const sample = rockSample(u, v)
      for (const translated of [rockSample(u + 1, v), rockSample(u, v + 1)]) {
        expect(translated.tone).toBeCloseTo(sample.tone, 10)
        expect(translated.height).toBeCloseTo(sample.height, 10)
      }
    }
})

test('the shared rock texture has varied albedo and unit normals with complete mipmapped data', () => {
  const texture = rockTexture()
  const pixels = texture.image.data
  if (!pixels) throw new Error('Rock pixels missing')
  expect(pixels.length).toBe(256 * 256 * 4)
  let minimumTone = 255
  let maximumTone = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const x = Number(pixels[index]) / 127.5 - 1
    const y = Number(pixels[index + 1]) / 127.5 - 1
    const z = Number(pixels[index + 2]) / 127.5 - 1
    expect(Math.abs(Math.hypot(x, y, z) - 1)).toBeLessThan(0.01)
    minimumTone = Math.min(minimumTone, Number(pixels[index + 3]))
    maximumTone = Math.max(maximumTone, Number(pixels[index + 3]))
  }
  expect(maximumTone - minimumTone).toBeGreaterThan(50)
  expect(texture.generateMipmaps).toBe(true)
  texture.dispose()
})
