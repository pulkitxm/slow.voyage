import { expect, test } from 'bun:test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'
import { browserExecutable } from '../scripts/browser'
import { productionFixture } from './fixture'

interface Readout {
  time: number
  speed: number
  gear: string
  steering: number
}

async function readout(page: Page) {
  return page.evaluate(() => ({
    time: performance.now(),
    speed: Number(document.querySelector('.speed-value')?.textContent),
    gear: document.querySelector('.gear')?.textContent ?? '',
    steering: Number(document.querySelector('.drive')?.getAttribute('data-steering')),
  }))
}

async function sample(page: Page, duration: number) {
  return page.evaluate(async (duration) => {
    const start = performance.now()
    const result: Readout[] = []
    while (performance.now() - start < duration) {
      result.push({
        time: performance.now() - start,
        speed: Number(document.querySelector('.speed-value')?.textContent),
        gear: document.querySelector('.gear')?.textContent ?? '',
        steering: Number(document.querySelector('.drive')?.getAttribute('data-steering')),
      })
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return result
  }, duration)
}

async function drive(
  run: (page: Page, directory: string) => Promise<void>,
  options: { touch?: boolean; controller?: 'standard' } = {},
) {
  const directory = resolve('.review/held-driving')
  await mkdir(directory, { recursive: true })
  const fixture = productionFixture(options.controller ?? false)
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath: browserExecutable(), headless: true })
    const page = await browser.newPage({
      viewport: options.touch ? { width: 320, height: 780 } : { width: 1280, height: 720 },
      hasTouch: options.touch ?? false,
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(fixture.url)
    await page.locator('.intro .primary-button').click({ timeout: 30000 })
    await page.keyboard.press('Shift+V')
    await page.waitForSelector('[data-vehicle="bus"]')
    await page.keyboard.press('r')
    await run(page, directory)
    expect(errors).toEqual([])
  } finally {
    try {
      await browser?.close()
    } finally {
      await fixture.stop()
    }
  }
}

test('held boost increases acceleration and preserves braking and assisted speed control', async () => {
  await drive(async (page, directory) => {
    await page.keyboard.down('Shift')
    await page.waitForTimeout(250)
    expect((await readout(page)).speed).toBe(0)
    expect(await page.locator('.drive').getAttribute('data-boost')).toBe('false')
    await page.keyboard.up('Shift')
    await page.keyboard.down('w')
    await page.waitForTimeout(4000)
    const normal = await readout(page)
    await page.keyboard.up('w')
    await page.keyboard.press('r')
    await page.waitForTimeout(250)
    await page.keyboard.down('Shift')
    await page.keyboard.down('w')
    await page.waitForSelector('[data-boost="true"]')
    await page.waitForTimeout(4000)
    const boosted = await readout(page)
    expect(boosted.speed).toBeGreaterThan(normal.speed + 3)
    await page.screenshot({ path: resolve(directory, 'boost-driving.png') })
    await page.keyboard.down('s')
    await page.waitForSelector('[data-boost="false"]')
    const braking = await readout(page)
    await page.waitForTimeout(600)
    expect((await readout(page)).speed).toBeLessThan(braking.speed)
    await page.keyboard.up('s')
    await page.keyboard.up('w')
    await page.keyboard.up('Shift')
    await page.keyboard.press('f')
    await page.waitForSelector('[data-assistance="full"]')
    await page.keyboard.down('Shift')
    await page.waitForTimeout(250)
    expect(await page.locator('.drive').getAttribute('data-boost')).toBe('false')
    expect(await page.locator('[data-assistance]').getAttribute('data-assistance')).toBe('full')
    await page.keyboard.up('Shift')
    await Bun.write(resolve(directory, 'boost.json'), JSON.stringify({ normal, boosted }, null, 2))
  })
}, 90000)

test('standard controller boost clears on focus loss and waits for released controls', async () => {
  await drive(
    async (page) => {
      await page.waitForSelector('[data-controller="connected"]')
      await page.keyboard.press('j')
      await page.waitForTimeout(180)
      expect(await page.locator('.drive').getAttribute('data-boost')).toBe('false')
      await page.keyboard.press('k')
      await page.waitForSelector('[data-boost="true"]')
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      await page.waitForSelector('[data-boost="false"]')
      await page.waitForTimeout(180)
      expect(await page.locator('.drive').getAttribute('data-boost')).toBe('false')
      await page.keyboard.press('0')
      await page.waitForTimeout(180)
      await page.keyboard.press('k')
      await page.waitForSelector('[data-boost="true"]')
      await page.keyboard.press('5')
      await page.waitForSelector('[data-controller="none"][data-boost="false"]')
    },
    { controller: 'standard' },
  )
}, 90000)

test('touch boost supports simultaneous accelerator input and releases captured pointers', async () => {
  await drive(
    async (page, directory) => {
      const session = await page.context().newCDPSession(page)
      const accelerator = await page
        .getByRole('button', { name: 'Accelerate', exact: true })
        .boundingBox()
      const boost = await page.getByRole('button', { name: 'Boost', exact: true }).boundingBox()
      if (!accelerator || !boost) throw new Error('Touch driving controls missing')
      const pedal = {
        id: 1,
        x: accelerator.x + accelerator.width / 2,
        y: accelerator.y + accelerator.height / 2,
      }
      const reserve = { id: 2, x: boost.x + boost.width / 2, y: boost.y + boost.height / 2 }
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [reserve] })
      await page.waitForTimeout(150)
      expect(await page.locator('.drive').getAttribute('data-boost')).toBe('false')
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [reserve, pedal],
      })
      await page.waitForSelector('[data-boost="true"]')
      await page.waitForTimeout(1000)
      await page.screenshot({ path: resolve(directory, 'touch-boost.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pedal] })
      await page.waitForSelector('[data-boost="false"]')
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      await page.waitForTimeout(150)
      expect(await page.locator('.drive').getAttribute('data-boost')).toBe('false')
      await session.detach()
    },
    { touch: true },
  )
}, 90000)

test('reverse cruise stops, persists, and releases speed control to the driver', async () => {
  await drive(async (page, directory) => {
    await page.keyboard.press('f')
    await page.waitForSelector('[data-assistance="full"]')
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    await page.getByRole('tab', { name: 'controls', exact: true }).click()
    await page.getByRole('button', { name: 'Reverse', exact: true }).click()
    await page.locator('#cruise-speed').fill('10')
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.querySelector('.gear')?.textContent === 'R' &&
        Number(document.querySelector('.speed-value')?.textContent) >= 8,
      undefined,
      { timeout: 30000 },
    )
    const reverse = await readout(page)
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await page.waitForFunction(
      () => Number(document.querySelector('.speed-value')?.textContent) === 0,
    )
    const stopped = await readout(page)
    await page.waitForTimeout(1000)
    expect((await readout(page)).speed).toBe(0)
    await page.keyboard.press('-')
    await page.waitForSelector('.gear:text-is("R")')
    await page.keyboard.press('w')
    await page.waitForSelector('[data-assistance="steer"]')
    const preference = await page.evaluate(
      () => JSON.parse(localStorage.getItem('slowroads-settings') ?? '{}').cruiseSpeed,
    )
    expect(preference).toBeLessThan(0)
    await page.reload()
    await page.getByRole('button', { name: 'Open settings', exact: true }).click({ timeout: 30000 })
    await page.getByRole('tab', { name: 'controls', exact: true }).click()
    expect(
      await page.getByRole('button', { name: 'Reverse', exact: true }).getAttribute('aria-pressed'),
    ).toBe('true')
    await page.screenshot({ path: resolve(directory, 'reverse-cruise.png') })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await page.locator('.intro .text-button').click()
    await page.waitForSelector('.gear:text-is("R")')
    await page.waitForSelector('[data-assistance="full"]')
    await page.screenshot({ path: resolve(directory, 'reverse-cruise-reloaded.png') })
    await Bun.write(
      resolve(directory, 'reverse-cruise.json'),
      JSON.stringify({ reverse, stopped, preference }, null, 2),
    )
  })
}, 90000)

test('held keyboard brake slows the bus after powered acceleration', async () => {
  await drive(async (page, directory) => {
    await page.keyboard.down('w')
    await page.waitForTimeout(4000)
    const before = await readout(page)
    expect(before.speed).toBeGreaterThan(15)
    await page.keyboard.up('w')
    await page.keyboard.down('s')
    const braking = await sample(page, 1000)
    await page.keyboard.up('s')
    expect(braking.at(-1)?.speed ?? Infinity).toBeLessThan(before.speed - 5)
    await page.screenshot({ path: resolve(directory, 'braking.png') })
    await Bun.write(
      resolve(directory, 'braking.json'),
      JSON.stringify({ before, braking }, null, 2),
    )
  })
}, 120000)

test('held forward key stops accelerating reverse before forward travel', async () => {
  await drive(async (page, directory) => {
    await page.keyboard.down('s')
    await page.waitForTimeout(1000)
    const before = await readout(page)
    expect(before.gear).toBe('R')
    await page.keyboard.up('s')
    await page.keyboard.down('w')
    const handoff = await sample(page, 2500)
    await page.keyboard.up('w')
    await page.screenshot({ path: resolve(directory, 'direction-change.png') })
    await Bun.write(
      resolve(directory, 'direction-change.json'),
      JSON.stringify({ before, handoff }, null, 2),
    )
    const reverse = handoff.filter((frame) => frame.gear === 'R')
    expect(reverse.length).toBeGreaterThan(0)
    expect(Math.max(...reverse.map((frame) => frame.speed))).toBeLessThanOrEqual(before.speed + 1)
    expect(
      handoff.some((frame) => frame.gear !== 'R' && frame.gear !== 'N' && frame.speed > 1),
    ).toBe(true)
  })
}, 120000)

test('held steering keys turn, center, and cancel each other on the bus', async () => {
  await drive(async (page, directory) => {
    await page.keyboard.press('c')
    await page.waitForSelector('[data-camera="bonnet"]')
    await page.waitForFunction(
      () =>
        Math.abs(Number(document.querySelector('.drive')?.getAttribute('data-steering'))) < 0.001,
    )
    await page.screenshot({ path: resolve(directory, 'steering-center.png') })
    await page.keyboard.down('a')
    const left = await sample(page, 2000)
    expect(left.at(-1)?.steering ?? 0).toBeGreaterThan(0.5)
    expect(left.every((frame) => frame.steering >= 0 && frame.steering <= 0.65)).toBe(true)
    await page.screenshot({ path: resolve(directory, 'steering-left.png') })
    await page.keyboard.up('a')
    const released = await sample(page, 1500)
    expect(Math.abs(released.at(-1)?.steering ?? Infinity)).toBeLessThan(0.02)
    await page.keyboard.down('d')
    const right = await sample(page, 2000)
    expect(right.at(-1)?.steering ?? 0).toBeLessThan(-0.5)
    expect(right.every((frame) => frame.steering >= -0.65 && frame.steering <= 0.02)).toBe(true)
    await page.screenshot({ path: resolve(directory, 'steering-right.png') })
    await page.keyboard.down('a')
    const opposing = await sample(page, 1500)
    expect(Math.abs(opposing.at(-1)?.steering ?? Infinity)).toBeLessThan(0.02)
    await page.keyboard.up('a')
    await page.keyboard.up('d')
    await page.screenshot({ path: resolve(directory, 'steering-cancelled.png') })
    await Bun.write(
      resolve(directory, 'steering.json'),
      JSON.stringify({ left, released, right, opposing }, null, 2),
    )
  })
}, 120000)

test('escape pauses, resumes from the pause dialog, and closes the settings panel', async () => {
  await drive(async (page) => {
    await page.keyboard.press('Escape')
    await page.waitForSelector('dialog[open] #pause-title')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[aria-label="Pause driving"]')
    expect(await page.locator('dialog[open]').count()).toBe(0)
    await page.locator('[aria-label="Open settings"]').click()
    await page.waitForSelector('.settings-panel')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.settings-panel', { state: 'detached' })
    expect(await page.locator('[aria-label="Pause driving"]').count()).toBe(1)
  })
}, 60000)

test('journey switches dissolve smoothly without a long frame stall', async () => {
  await drive(async (page) => {
    await page.waitForTimeout(1500)
    const before = await page.locator('.drive').getAttribute('data-season')
    const result = await page.evaluate(async () => {
      const gaps: number[] = []
      let last = performance.now()
      let running = true
      const loop = () => {
        const now = performance.now()
        gaps.push(now - last)
        last = now
        if (running) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
      await new Promise((resolve) => setTimeout(resolve, 200))
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }))
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e' }))
      const veiled = document.querySelectorAll('.scene-veil').length
      await new Promise((resolve) => setTimeout(resolve, 600))
      const fading = Number(
        getComputedStyle(document.querySelector('.scene-veil') ?? document.body).opacity,
      )
      await new Promise((resolve) => setTimeout(resolve, 2200))
      running = false
      return {
        veiled,
        fading,
        remaining: document.querySelectorAll('.scene-veil').length,
        stall: Math.max(...gaps),
      }
    })
    expect(result.veiled).toBe(1)
    expect(result.fading).toBeGreaterThan(0)
    expect(result.fading).toBeLessThan(1)
    expect(result.remaining).toBe(0)
    expect(result.stall).toBeLessThan(500)
    expect(await page.locator('.drive').getAttribute('data-season')).not.toBe(before)
  })
}, 60000)
