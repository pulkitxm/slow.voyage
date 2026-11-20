import { expect, test } from 'bun:test'
import { Odometer, odometerKey, odometerPace } from './odometer'

function vault(start?: string) {
  const held = new Map<string, string>(start === undefined ? [] : [[odometerKey, start]])
  return {
    held,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  }
}

test('distance adds up across trips and survives a reload', () => {
  const store = vault()
  const first = new Odometer(store)
  for (let trip = 0; trip <= 1000; trip += 20) first.record(trip)
  expect(first.total).toBe(1000)
  first.keep()
  expect(store.held.get(odometerKey)).toBe('1000')
  const second = new Odometer(store)
  expect(second.total).toBe(1000)
  second.record(0)
  second.record(300)
  expect(second.total).toBe(1300)
})

test('a trip counter that restarts or jumps never subtracts or leaps', () => {
  const meter = new Odometer(vault('500'))
  meter.record(900)
  meter.record(950)
  meter.record(0)
  meter.record(30)
  meter.record(30 + odometerPace.leap + 1)
  expect(meter.total).toBe(580)
})

test('it saves every so often, reports when the display should change and shrugs off bad storage', () => {
  const store = vault('not a number')
  const meter = new Odometer(store)
  expect(meter.total).toBe(0)
  meter.record(0)
  expect(meter.record(odometerPace.show - 1)).toBe(false)
  expect(meter.record(odometerPace.show)).toBe(true)
  meter.record(odometerPace.save)
  expect(store.held.get(odometerKey)).toBe(String(odometerPace.save))
  const broken = new Odometer({
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  })
  broken.record(0)
  broken.record(300)
  expect(broken.total).toBe(300)
})
