import { expect, test } from 'bun:test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { browserExecutable } from '../scripts/browser'
import { productionFixture } from './fixture'

const directory = resolve('.review/controller-browser')
async function runMapping(run: (page: Page) => Promise<void>) {
  await mkdir(directory, { recursive: true })
  const fixture = productionFixture('custom')
  const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(fixture.url)
    await page.locator('.intro .primary-button').click({ timeout: 30000 })
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    await page.getByRole('tab', { name: 'controls', exact: true }).click()
    await page
      .locator('.controller-mapping')
      .getByRole('button', { name: 'custom', exact: true })
      .click()
    await run(page)
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await fixture.stop()
  }
}

async function bind(page: Page, name: string, key: string) {
  await page.getByRole('button', { name: `Bind ${name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Ready', exact: true }).click()
  await page.keyboard.press(key)
  await page.locator('.mapping-capture > small:first-of-type').waitFor()
  await page.keyboard.press('Digit0')
  const save = page.getByRole('button', { name: `Save ${name} binding`, exact: true })
  await save.waitFor()
  await page.waitForFunction(
    () =>
      !document.querySelector<HTMLButtonElement>('.mapping-capture button[aria-label^="Save "]')
        ?.disabled,
  )
  await save.click()
}

test('calibrates split devices and camera input, drives, and restores bindings after reindexing and reload', async () => {
  await runMapping(async (page) => {
    await bind(page, 'Steer left', 'Digit1')
    await bind(page, 'Steer right', 'Digit2')
    await bind(page, 'Accelerate', 'Digit3')
    await bind(page, 'Boost', 'KeyJ')
    await bind(page, 'Brake / reverse', 'Digit4')
    await bind(page, 'Handbrake', 'KeyB')
    await page.locator('.mapping-group > summary:text-is("Shortcuts")').click()
    await bind(page, 'Toggle assistance', 'Digit5')
    await page.locator('.mapping-group > summary:text-is("Camera")').click()
    await bind(page, 'Look left', 'Digit6')
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('slowroads-settings') ?? '{}'),
    )
    expect(saved.controllerBindings.throttle).toEqual({
      deviceId: 'Portable pedals',
      kind: 'axis',
      index: 0,
      from: 1,
      to: -1,
    })
    expect(saved.controllerBindings.brake).toEqual({
      deviceId: 'Portable pedals',
      kind: 'axis',
      index: 1,
      from: -1,
      to: 1,
    })
    expect(saved.controllerBindings.steerLeft.to).toBe(-0.9)
    expect(saved.controllerBindings.steerRight.to).toBe(0.8)
    await page.screenshot({ path: resolve(directory, 'camera-binding.png') })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await page.keyboard.press('KeyK')
    await page.waitForSelector('[data-boost="true"]')
    await page.waitForFunction(
      () => Number(document.querySelector('.speed-value')?.textContent) > 15,
    )
    await page.keyboard.press('Digit3')
    await page.waitForSelector('[data-boost="false"]')
    await page.keyboard.press('Digit0')
    await page.keyboard.press('Digit5')
    await page.waitForSelector('[data-assistance="full"]')
    await page.keyboard.press('Digit0')
    await page.keyboard.press('c')
    await page.waitForSelector('[data-camera="bonnet"]')
    await page.screenshot({ path: resolve(directory, 'bonnet-center.png') })
    await page.keyboard.press('Digit6')
    await page.waitForTimeout(700)
    await page.waitForSelector('[data-assistance="full"]')
    await page.screenshot({ path: resolve(directory, 'bonnet-look.png') })
    await page.keyboard.press('Digit0')
    await page.keyboard.press('Digit1')
    await page.waitForSelector('[data-assistance="speed"]')
    await page.keyboard.press('Digit0')
    await page.keyboard.press('Digit7')
    await page.waitForTimeout(100)
    await page.keyboard.press('Digit8')
    await page.waitForTimeout(100)
    await page.keyboard.press('Digit9')
    await page.waitForTimeout(100)
    await page.keyboard.press('Digit0')
    await page.waitForTimeout(100)
    await page.keyboard.press('Digit3')
    await page.waitForSelector('[data-assistance="off"]')
    await page.keyboard.press('Digit0')
    await page.reload()
    await page.getByRole('button', { name: 'Open settings', exact: true }).click({ timeout: 30000 })
    await page.getByRole('tab', { name: 'controls', exact: true }).click()
    expect(
      await page
        .locator('.controller-mapping')
        .getByRole('button', { name: 'custom', exact: true })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    const restored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('slowroads-settings') ?? '{}').controllerBindings,
    )
    expect(restored).toEqual(saved.controllerBindings)
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .getByRole('button', { name: 'Bind Accelerate', exact: true })
      .scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: resolve(directory, 'portrait-bindings.png') })
    await Bun.write(resolve(directory, 'bindings.json'), JSON.stringify(restored, null, 2))
  })
}, 120000)

test('copies a standard layout without discarding it when changing modes', async () => {
  await runMapping(async (page) => {
    await page.locator('#controller-preset').selectOption('Portable gamepad')
    await page.getByRole('button', { name: 'Copy layout', exact: true }).click()
    const read = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('slowroads-settings') ?? '{}').controllerBindings,
      )
    const bindings = await read()
    expect(bindings.throttle).toEqual({
      deviceId: 'Portable gamepad',
      kind: 'button',
      index: 7,
      from: 0,
      to: 1,
    })
    await page
      .locator('.controller-mapping')
      .getByRole('button', { name: 'standard', exact: true })
      .click()
    await page
      .locator('.controller-mapping')
      .getByRole('button', { name: 'custom', exact: true })
      .click()
    expect(await read()).toEqual(bindings)
    await page.getByRole('button', { name: 'Clear Accelerate binding', exact: true }).click()
    expect((await read()).throttle).toBeUndefined()
    expect((await read()).brake).toEqual(bindings.brake)
  })
}, 60000)
