import { expect, test } from 'bun:test'
import {
  alarm,
  type Driver,
  fall,
  fallenPose,
  flee,
  fleePace,
  freshFate,
  reactionLayout,
  struck,
  threatened,
} from './reactions'

const driver = (speed: number, x = 0): Driver => ({
  x,
  s: 0,
  yaw: 0,
  speed,
  halfWidth: 0.85,
  front: 2.1,
  rear: 2,
})
const walker = (x: number, s: number) => ({ kind: 'person' as const, x, s, radius: 0.3 })

test('a fast car knocks down whoever is under it and a crawling one does not', () => {
  expect(struck(driver(20), walker(0.4, 1.5))).toBe(true)
  expect(struck(driver(-20), walker(0.4, -1.5))).toBe(true)
  expect(struck(driver(reactionLayout.knock - 0.1), walker(0.4, 1.5))).toBe(false)
  expect(struck(driver(20), walker(2, 1.5))).toBe(false)
  expect(struck(driver(20), walker(0, 4))).toBe(false)
  expect(struck(driver(20), { kind: 'elephant', x: 0, s: 1, radius: 1.2 })).toBe(false)
})

test('people in the path of a moving car see it coming from further away at speed', () => {
  expect(threatened(driver(8), walker(0.5, 8))).toBe(true)
  expect(threatened(driver(8), walker(0.5, 18))).toBe(false)
  expect(threatened(driver(30), walker(0.5, 18))).toBe(true)
  expect(threatened(driver(30), walker(5, 10))).toBe(false)
  expect(threatened(driver(30), walker(0.5, -6))).toBe(false)
  expect(threatened(driver(0.5), walker(0.5, 4))).toBe(false)
  expect(threatened(driver(-8), walker(0.5, -7))).toBe(true)
})

test('an alarmed walker waits a beat, runs away from the car and later walks back', () => {
  const fate = freshFate()
  expect(alarm(fate, 10, reactionLayout.fleeTime, 0.3)).toBe(true)
  expect(alarm(fate, 10.1, reactionLayout.fleeTime, 0.3)).toBe(false)
  const car = driver(0)
  const outward = { x: 1, s: 0 }
  expect(flee(fate, 'person', car, 4, 6, outward, 10.1, 1 / 60)).toBe(0)
  let time = 10.4
  for (let step = 0; step < 180; step++) {
    flee(fate, 'person', car, 4 + fate.dx, 6 + fate.ds, outward, time, 1 / 60)
    time += 1 / 60
  }
  const strayed = Math.hypot(fate.dx, fate.ds)
  expect(strayed).toBeGreaterThan(8)
  expect(strayed).toBeLessThan(fleePace.person * 3.1)
  expect(fate.dx).toBeGreaterThan(0)
  expect(fate.ds).toBeGreaterThan(0)
  time = fate.until + 2.1
  for (let step = 0; step < 60 * 40; step++) {
    flee(fate, 'person', car, 4 + fate.dx, 6 + fate.ds, outward, time, 1 / 60)
    time += 1 / 60
  }
  expect(Math.hypot(fate.dx, fate.ds)).toBeLessThan(0.001)
})

test('nobody runs further than the limit however long the alarm lasts', () => {
  const fate = freshFate()
  alarm(fate, 0, 600, 0)
  for (let step = 0; step < 60 * 120; step++)
    flee(fate, 'horse', driver(0), 3 + fate.dx, fate.ds, { x: 1, s: 0 }, step / 60, 1 / 60)
  expect(Math.hypot(fate.dx, fate.ds)).toBeLessThanOrEqual(reactionLayout.farthest + 0.01)
})

test('a struck walker is thrown ahead of the car, comes to rest and then bleeds', () => {
  const down = fall(driver(25), 0.3, 2, 0, 100)
  expect(down.dirS).toBeGreaterThan(0.9)
  expect(down.reach).toBeLessThanOrEqual(reactionLayout.throwLimit)
  const early = fallenPose(down, 100.2)
  const rest = fallenPose(down, 100 + reactionLayout.throwTime + reactionLayout.stain + 1)
  expect(early.lift).toBeGreaterThan(0)
  expect(early.pool).toBe(0)
  expect(rest.lift).toBeCloseTo(0, 6)
  expect(rest.tip).toBe(1)
  expect(rest.pool).toBe(1)
  expect(rest.s - down.s).toBeCloseTo(down.dirS * down.reach, 6)
  const behind = fall(driver(-12), 0, -2, 0, 0)
  expect(behind.dirS).toBeLessThan(-0.9)
  expect(alarm(Object.assign(freshFate(), { fallen: down }), 200, 5, 0)).toBe(false)
})

test('a struck walker is swept clear of the bodywork before the car passes', () => {
  for (const offset of [-0.6, 0, 0.3]) {
    const car = driver(25)
    const down = fall(car, offset, 2, 0, 0)
    const soon = fallenPose(down, reactionLayout.sweep)
    expect(Math.abs(soon.x)).toBeGreaterThanOrEqual(car.halfWidth + reactionLayout.berth - 0.001)
    if (offset !== 0) expect(Math.sign(soon.x)).toBe(Math.sign(offset))
  }
})

test('large animals topple where they stand and only at a real impact speed', () => {
  const cow = { kind: 'cow' as const, x: 0, s: 2.9, radius: 0.75 }
  expect(struck(driver(reactionLayout.topple - 0.5), cow)).toBe(false)
  expect(struck(driver(20), cow)).toBe(true)
  const down = fall(driver(20), cow.x, cow.s, 0, 0, true)
  const rest = fallenPose(down, 5)
  expect(rest.x).toBe(cow.x)
  expect(rest.s).toBe(cow.s)
})
