import { expect, test } from 'bun:test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'
import { browserExecutable } from '../scripts/browser'
import { productionFixture } from './fixture'

function trackGraphicsTextures() {
  const textures = new Set<WebGLTexture>()
  const create = WebGL2RenderingContext.prototype.createTexture
  const release = WebGL2RenderingContext.prototype.deleteTexture
  const link = WebGL2RenderingContext.prototype.linkProgram
  let links = 0
  WebGL2RenderingContext.prototype.linkProgram = function (program) {
    links++
    link.call(this, program)
  }
  WebGL2RenderingContext.prototype.createTexture = function () {
    const texture = create.call(this)
    if (texture) textures.add(texture)
    return texture
  }
  WebGL2RenderingContext.prototype.deleteTexture = function (texture) {
    if (texture) textures.delete(texture)
    release.call(this, texture)
  }
  Object.assign(window, { graphicsTextures: () => textures.size, graphicsLinks: () => links })
}

for (const software of [false, true]) {
  test(`${software ? 'software' : 'automatic'} graphics exports complete photos, drives, and releases resized buffers`, async () => {
    const directory = resolve('.review/graphics-checks')
    await mkdir(directory, { recursive: true })
    const fixture = productionFixture()
    const browser = await chromium.launch({
      executablePath: browserExecutable(),
      headless: true,
      args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
    })
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.addInitScript(() => {
        localStorage.setItem('slowroads-settings', JSON.stringify({ volume: 0 }))
      })
      await page.addInitScript(trackGraphicsTextures)
      await page.goto(fixture.url)
      await page.locator('.intro .text-button').click({ timeout: 60000 })
      await page.getByRole('button', { name: 'Open settings' }).click()
      await page.getByRole('tab', { name: 'display', exact: true }).click()
      const samples: object[] = []
      let textureCount: number | undefined
      for (const [capture, viewport] of [
        { width: 1280, height: 720 },
        { width: 720, height: 1280 },
        { width: 960, height: 640 },
        { width: 1280, height: 720 },
      ].entries()) {
        await page.setViewportSize(viewport)
        await page.evaluate(async () => {
          await new Promise(requestAnimationFrame)
          await new Promise(requestAnimationFrame)
        })
        const graphics = await page.evaluate(() => {
          const canvas = document.querySelector('canvas')
          const gl = canvas?.getContext('webgl2')
          if (!canvas || !gl) throw new Error('Driving canvas is unavailable')
          const debug = gl.getExtension('WEBGL_debug_renderer_info')
          return {
            width: canvas.width,
            height: canvas.height,
            attributes: gl.getContextAttributes(),
            renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '',
            textures: (window as unknown as { graphicsTextures: () => number }).graphicsTextures(),
            error: gl.getError(),
          }
        })
        const detected = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(
          graphics.renderer,
        )
        if (software) expect(detected).toBe(true)
        expect(graphics.attributes?.antialias).toBe(!detected)
        expect(graphics.attributes?.preserveDrawingBuffer).toBe(true)
        expect(graphics.error).toBe(0)
        textureCount ??= graphics.textures
        expect(graphics.textures).toBe(textureCount)
        const download = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Capture the view' }).click()
        const photo = await download
        const name = `${software ? 'software' : 'automatic'}-${capture}-${viewport.width}-${viewport.height}.png`
        const path = resolve(directory, name)
        await photo.saveAs(path)
        const image = PNG.sync.read(Buffer.from(await Bun.file(path).arrayBuffer()))
        expect(image.width).toBe(graphics.width)
        expect(image.height).toBe(graphics.height)
        const colors = new Set<number>()
        let opaque = 0
        for (let pixel = 0; pixel < image.data.length; pixel += 4) {
          const red = image.data[pixel] ?? 0
          const green = image.data[pixel + 1] ?? 0
          const blue = image.data[pixel + 2] ?? 0
          colors.add((red << 16) | (green << 8) | blue)
          if ((image.data[pixel + 3] ?? 0) > 240) opaque++
        }
        expect(colors.size).toBeGreaterThan(120)
        expect(opaque / (image.width * image.height)).toBeGreaterThan(0.99)
        samples.push({ viewport, graphics, photo: name, colors: colors.size })
      }
      await page.getByRole('button', { name: 'Close settings' }).click()
      await page.keyboard.press('f')
      await page.waitForSelector('[data-assistance="off"]')
      await page.keyboard.press('r')
      await page.waitForFunction(
        () => Number(document.querySelector('.speed-value')?.textContent) === 0,
      )
      await page.keyboard.down('w')
      await page.waitForTimeout(3000)
      await page.keyboard.down('d')
      await page.waitForFunction(
        () =>
          Math.abs(Number(document.querySelector('.drive')?.getAttribute('data-steering'))) > 0.05,
      )
      const steering = await page.locator('.drive').getAttribute('data-steering')
      await page.keyboard.up('d')
      await page.waitForFunction(
        () =>
          Math.abs(Number(document.querySelector('.drive')?.getAttribute('data-steering'))) < 0.02,
      )
      await page.keyboard.up('w')
      const powered = Number(await page.locator('.speed-value').textContent())
      expect(powered).toBeGreaterThan(10)
      await page.keyboard.down('s')
      await page.waitForTimeout(2000)
      await page.keyboard.up('s')
      const braked = Number(await page.locator('.speed-value').textContent())
      expect(braked).toBeLessThan(powered - 5)
      const driving = { powered, braked, steering }
      expect(errors).toEqual([])
      await Bun.write(
        resolve(directory, `${software ? 'software' : 'automatic'}.json`),
        JSON.stringify({ samples, driving, errors }, null, 2),
      )
    } finally {
      await browser.close()
      await fixture.stop()
    }
  }, 160000)
}

test('software cockpit changes retain textures and avoid rebuilding world shaders', async () => {
  const directory = resolve('.review/graphics-checks')
  await mkdir(directory, { recursive: true })
  const fixture = productionFixture()
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript(trackGraphicsTextures)
    await page.addInitScript(() => {
      localStorage.setItem(
        'slowroads-settings',
        JSON.stringify({ volume: 0, camera: 'bonnet', vehicle: 'bus' }),
      )
    })
    await page.goto(fixture.url)
    await page.locator('.intro .primary-button').click({ timeout: 60000 })
    await page.waitForSelector('[data-camera="bonnet"][data-vehicle="bus"]')
    const counts = new Map<string, number>()
    const samples: object[] = []
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const quality of ['high', 'low']) {
        for (const [vehicle, label] of [
          ['bus', 'Wanderer bus'],
          ['motorcycle', 'Motorcycle'],
          ['touring', 'Grand tourer'],
        ] as const) {
          await page.getByRole('button', { name: 'Open settings' }).click()
          await page.getByRole('tab', { name: 'vehicle', exact: true }).click()
          const linksBefore = await page.evaluate(() =>
            (window as unknown as { graphicsLinks: () => number }).graphicsLinks(),
          )
          await page.locator('.vehicle-options').getByRole('button', { name: label }).click()
          await page.getByRole('tab', { name: 'display', exact: true }).click()
          await page
            .getByRole('button', {
              name: quality === 'high' ? 'Full beauty' : 'Easy on the engine',
              exact: true,
            })
            .click()
          await page.getByRole('tab', { name: 'journey', exact: true }).click()
          await page
            .getByRole('button', { name: cycle === 1 ? 'Night' : 'Daylight', exact: true })
            .click()
          await page.getByRole('button', { name: 'Close settings' }).click()
          await page.waitForSelector(`[data-vehicle="${vehicle}"]`)
          const graphics = await page.evaluate(async () => {
            await new Promise(requestAnimationFrame)
            await new Promise(requestAnimationFrame)
            const gl = document.querySelector('canvas')?.getContext('webgl2')
            if (!gl) throw new Error('Driving canvas is unavailable')
            return {
              textures: (
                window as unknown as { graphicsTextures: () => number }
              ).graphicsTextures(),
              links: (window as unknown as { graphicsLinks: () => number }).graphicsLinks(),
              error: gl.getError(),
            }
          })
          const key = `${vehicle}-${quality}`
          const expected = counts.get(key) ?? graphics.textures
          expect(graphics.textures).toBe(expected)
          counts.set(key, expected)
          expect(graphics.error).toBe(0)
          expect(graphics.links - linksBefore).toBeLessThanOrEqual(2)
          if (cycle < 2)
            await page.screenshot({
              path: resolve(directory, `cockpit-${key}-${cycle === 1 ? 'night' : 'day'}.png`),
            })
          samples.push({ cycle, vehicle, quality, linksBefore, ...graphics })
        }
      }
    }
    expect(errors).toEqual([])
    await Bun.write(
      resolve(directory, 'cockpit-textures.json'),
      JSON.stringify({ samples, errors }, null, 2),
    )
  } finally {
    await browser.close()
    await fixture.stop()
  }
}, 160000)
