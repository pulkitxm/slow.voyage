import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { browserExecutable } from './browser'

test('browser overrides accept command names and project-relative executables', () => {
  const binary = resolve('tools', 'test-browser')
  for (const command of ['test-browser', './tools/test-browser']) {
    let scanned = false
    expect(
      browserExecutable(` ${command} `, {
        which: (value) => (value === command ? binary : null),
        installations: () => {
          scanned = true
          return []
        },
      }),
    ).toBe(binary)
    expect(scanned).toBe(false)
  }
})

test('an invalid explicit browser does not silently select another installation', () => {
  expect(() =>
    browserExecutable('missing-browser', {
      which: () => null,
      installations: () => [resolve('tools', 'other-browser')],
    }),
  ).toThrow('BROWSER_EXECUTABLE')
})

test('browser discovery uses PATH before inspecting installations', () => {
  const binary = resolve('tools', 'chromium')
  let scanned = false
  expect(
    browserExecutable('', {
      which: (command) => (command === 'chromium' ? binary : null),
      installations: () => {
        scanned = true
        return []
      },
    }),
  ).toBe(binary)
  expect(scanned).toBe(false)
})

test('installed-browser discovery skips unavailable entries', () => {
  const binary = resolve('tools', 'installed-browser')
  expect(
    browserExecutable('', {
      which: (command) => (command === binary ? binary : null),
      installations: () => [resolve('tools', 'missing-browser'), binary],
    }),
  ).toBe(binary)
})

test('missing browsers produce an actionable configuration error', () => {
  expect(() =>
    browserExecutable('', {
      which: () => null,
      installations: () => {
        throw new Error('No installation found')
      },
    }),
  ).toThrow('Install Chrome or Chromium')
})
