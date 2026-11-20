import { expect, test } from 'bun:test'
import { loopCells } from './field'
import { landscapeIds } from './landscapes'
import { lifeLayout, placeMember, planSlot } from './life'
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
