import { expect, test } from 'bun:test'
import { loopCells } from './field'
import { landscapeIds } from './landscapes'
import { lifeLayout, placeMember, planSlot, stroll, wander, wanderLayout } from './life'
import { roadCoordinates, roadLayout } from './road'
import { defaults, shoreHeight, World } from './world'

const cells = loopCells(lifeLayout.slot)

function plans(world: World, level: 'quiet' | 'lively') {
  return Array.from({ length: cells }, (_, slot) => planSlot(world, slot, level)).filter(
    (plan) => plan !== null,
  )
}

test('roadside life is absent when switched off', () => {
  const world = new World({ ...defaults, life: 'none' })
  for (let slot = 0; slot < cells; slot++) expect(planSlot(world, slot, 'none')).toBeNull()
})

test('every landscape has walkers and herds, more when lively', () => {
  for (const landscape of landscapeIds) {
    const world = new World({ ...defaults, landscape })
    const lively = plans(world, 'lively')
    const quiet = plans(world, 'quiet')
    expect(lively.some((plan) => plan.walkers)).toBe(true)
    expect(lively.some((plan) => !plan.walkers)).toBe(true)
    expect(lively.length).toBeGreaterThan(quiet.length)
  }
})

test('the same road always meets the same company', () => {
  const world = new World({ ...defaults })
  for (let slot = 0; slot < cells; slot += 7)
    expect(planSlot(world, slot, 'lively')).toEqual(planSlot(world, slot, 'lively'))
})

test('nobody walks or grazes on the carriageway or in the water', () => {
  for (const landscape of landscapeIds) {
    const world = new World({ ...defaults, landscape })
    for (const plan of plans(world, 'lively'))
      for (const member of plan.members)
        for (const time of [0, 7.3, 31, 96.5, 240]) {
          const far = { x: world.road(0).x + 900, s: -900 }
          const spot = placeMember(world, plan, member, 0, time, far)
          const offset = Math.abs(roadCoordinates(world, spot.x, spot.s).distance)
          expect(offset).toBeGreaterThan(roadLayout.halfWidth + 0.9)
          expect(spot.y).toBeGreaterThan(shoreHeight)
          expect(Number.isFinite(spot.yaw + spot.step + spot.stride + spot.graze)).toBe(true)
        }
  }
})

test('walkers step further from the road as a car draws near', () => {
  const world = new World({ ...defaults })
  const plan = plans(world, 'lively').find((candidate) => candidate.walkers)
  const member = plan?.members[0]
  if (!plan || !member) throw new Error('No walkers were planned')
  const away = placeMember(world, plan, member, 0, 12, { x: 0, s: -5000 })
  const passing = placeMember(world, plan, member, 0, 12, { x: away.x, s: away.s })
  const offset = (spot: { x: number; s: number }) =>
    Math.abs(roadCoordinates(world, spot.x, spot.s).distance)
  expect(offset(passing)).toBeGreaterThan(offset(away) + 1)
})

const roamers = Array.from({ length: 60 }, (_, index) => ({
  phase: (index * 7.31) % 100,
  roam: 1.5 + ((index * 0.37) % 1) * 2.5,
  heading: (index * 1.7) % (Math.PI * 2),
  pace: 0.5 + ((index * 0.61) % 1) * 0.4,
}))

test('a grazing animal reports exactly the ground it covers and stands still between walks', () => {
  const tick = 0.05
  let walked = 0
  let stood = 0
  for (const member of roamers) {
    let before = wander(member, 0)
    for (let time = tick; time < 120; time += tick) {
      const now = wander(member, time)
      const covered = Math.hypot(now.x - before.x, now.s - before.s) / tick
      if (now.cycle === before.cycle) {
        expect(Math.abs(covered - (now.speed + before.speed) / 2)).toBeLessThan(0.12)
        if (now.speed === 0 && before.speed === 0) {
          expect(covered).toBe(0)
          stood++
        } else walked++
      }
      before = now
    }
  }
  expect(walked).toBeGreaterThan(1000)
  expect(stood).toBeGreaterThan(walked)
})

test('every walk goes somewhere at a walking pace and faces the way it travels', () => {
  const tick = 0.05
  for (const member of roamers) {
    let before = wander(member, 0)
    for (let time = tick; time < 120; time += tick) {
      const now = wander(member, time)
      expect(now.length).toBeGreaterThan(1)
      expect(now.speed).toBeLessThan(member.pace * 2.4)
      expect(Math.hypot(now.x, now.s)).toBeLessThan(member.roam * 1.25)
      const stepX = now.x - before.x
      const stepS = now.s - before.s
      const step = Math.hypot(stepX, stepS)
      if (now.cycle === before.cycle && step > 0.01)
        expect((stepX * now.headX + stepS * now.headS) / step).toBeGreaterThan(0.9)
      let turn = Math.atan2(now.headS, now.headX) - Math.atan2(before.headS, before.headX)
      turn = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))
      expect(turn / tick).toBeLessThan(5)
      before = now
    }
  }
  expect(wanderLayout.share).toBeLessThan(0.7)
})

test('a placed animal strides only while it moves', () => {
  const world = new World({ ...defaults })
  const far = { x: world.road(0).x + 900, s: -900 }
  let striding = 0
  let resting = 0
  for (const plan of plans(world, 'lively')) {
    if (plan.walkers) continue
    for (const member of plan.members.slice(0, 2))
      for (let time = 0; time < 60; time += 0.7) {
        const spot = placeMember(world, plan, member, 0, time, far)
        const next = placeMember(world, plan, member, 0, time + 0.05, far)
        const covered = Math.hypot(next.x - spot.x, next.s - spot.s) / 0.05
        if (spot.stride > 0.08) {
          expect(spot.pace).toBeGreaterThan(0.02)
          expect(covered).toBeGreaterThan(0.01)
          striding++
        } else if (spot.pace === 0 && next.pace === 0) {
          expect(covered).toBe(0)
          resting++
        }
      }
  }
  expect(striding).toBeGreaterThan(20)
  expect(resting).toBeGreaterThan(20)
})

test('walkers turn round on a small walked arc instead of flipping on the spot', () => {
  const lap = (lifeLayout.stride + Math.PI * lifeLayout.turn) * 2
  const tick = 0.02
  let before = stroll(0)
  let reversed = 0
  for (let travelled = tick; travelled < lap * 2.2; travelled += tick) {
    const now = stroll(travelled)
    expect(Math.hypot(now.along - before.along, now.out - before.out)).toBeCloseTo(tick, 3)
    expect(Math.hypot(now.headAlong, now.headOut)).toBeCloseTo(1, 9)
    expect(now.headAlong * before.headAlong + now.headOut * before.headOut).toBeGreaterThan(0.99)
    expect(now.out).toBeGreaterThanOrEqual(-1e-9)
    if (Math.sign(now.headAlong) !== Math.sign(before.headAlong)) reversed++
    before = now
  }
  expect(reversed).toBeGreaterThanOrEqual(4)
  const world = new World({ ...defaults })
  const plan = plans(world, 'lively').find((candidate) => candidate.walkers)
  const member = plan?.members[0]
  if (!plan || !member) throw new Error('No walkers were planned')
  const far = { x: world.road(0).x + 900, s: -900 }
  let last = placeMember(world, plan, member, 0, 0, far)
  for (let time = 0.05; time < (lap / member.pace) * 1.1; time += 0.05) {
    const spot = placeMember(world, plan, member, 0, time, far)
    const covered = Math.hypot(spot.x - last.x, spot.s - last.s) / 0.05
    expect(covered).toBeGreaterThan(member.pace * 0.6)
    expect(covered).toBeLessThan(member.pace * 1.4)
    let turn = spot.yaw - last.yaw
    turn = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))
    expect(turn / 0.05).toBeLessThan((member.pace / lifeLayout.turn) * 1.5)
    last = spot
  }
})
