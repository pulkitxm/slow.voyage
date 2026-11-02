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
}

async function readout(page: Page) {
  return page.evaluate(() => ({
    time: performance.now(),
    speed: Number(document.querySelector('.speed-value')?.textContent),
    gear: document.querySelector('.gear')?.textContent ?? '',
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
      })
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return result
  }, duration)
}

async function drive(run: (page: Page, directory: string) => Promise<void>) {
  const directory = resolve('.review/held-driving')
  await mkdir(directory, { recursive: true })
  const fixture = productionFixture()
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath: browserExecutable(), headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
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
