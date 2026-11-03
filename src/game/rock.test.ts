import { expect, test } from 'bun:test'
import { PNG } from 'pngjs'

test('the bundled rock normal map retains opaque unit normals and varied surface relief', async () => {
  const file = Bun.file(new URL('../assets/rock-normal.png', import.meta.url))
  const image = PNG.sync.read(Buffer.from(await file.arrayBuffer()))
  expect([image.width, image.height]).toEqual([512, 512])
  let minimumZ = 1
  let maximumZ = 0
  let maximumLengthError = 0
  let minimumAlpha = 255
  for (let index = 0; index < image.data.length; index += 4) {
    const x = Number(image.data[index]) / 127.5 - 1
    const y = Number(image.data[index + 1]) / 127.5 - 1
    const z = Number(image.data[index + 2]) / 127.5 - 1
    maximumLengthError = Math.max(maximumLengthError, Math.abs(Math.hypot(x, y, z) - 1))
    minimumAlpha = Math.min(minimumAlpha, Number(image.data[index + 3]))
    minimumZ = Math.min(minimumZ, z)
    maximumZ = Math.max(maximumZ, z)
  }
  expect(maximumZ - minimumZ).toBeGreaterThan(0.3)
  expect(maximumLengthError).toBeLessThan(0.01)
  expect(minimumAlpha).toBe(255)
})
