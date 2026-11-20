import type { Creature } from './creatures'

export const reactionLayout = {
  horn: 36,
  alarm: 32,
  notice: 0.28,
  lookAhead: 4,
  lookTime: 0.36,
  lane: 2.7,
  fleeTime: 5.5,
  alarmTime: 8,
  dodgeTime: 2.6,
  returnPace: 1.2,
  farthest: 26,
  knock: 3.2,
  throwTime: 0.6,
  throwReach: 0.24,
  throwLimit: 7,
  stain: 2.4,
  stains: 28,
} as const

export const fleePace: Record<Creature, number> = {
  person: 4.7,
  cow: 5.2,
  sheep: 5.6,
  deer: 9,
  horse: 9.5,
  goat: 6,
  camel: 6.5,
  elephant: 5,
}

export const heft: Record<Creature, number> = {
  person: 0.05,
  sheep: 0.06,
  goat: 0.06,
  deer: 0.1,
  cow: 0.3,
  horse: 0.28,
  camel: 0.3,
  elephant: 1,
}

export interface Driver {
  x: number
  s: number
  yaw: number
  speed: number
  halfWidth: number
  front: number
  rear: number
}

export interface Fall {
  x: number
  s: number
  dirX: number
  dirS: number
  reach: number
  yaw: number
  at: number
}

export interface Fate {
  until: number
  from: number
  dx: number
  ds: number
  headX: number
  headS: number
  stride: number
  fallen: Fall | null
}

export interface Bystander {
  kind: Creature
  x: number
  s: number
  radius: number
}

export function freshFate(): Fate {
  return { until: 0, from: 0, dx: 0, ds: 0, headX: 0, headS: 0, stride: 0, fallen: null }
}

export function carFrame(driver: Driver, x: number, s: number) {
  const dx = x - driver.x
  const ds = s - driver.s
  const sin = Math.sin(driver.yaw)
  const cos = Math.cos(driver.yaw)
  return { ahead: -sin * dx + cos * ds, aside: cos * dx + sin * ds }
}

export function threatened(driver: Driver, who: Bystander) {
  const pace = Math.abs(driver.speed)
  if (pace < 1.5) return false
  const facing = Math.sign(driver.speed) || 1
  const { ahead, aside } = carFrame(driver, who.x, who.s)
  const along = ahead * facing
  const reach = (facing > 0 ? driver.front : driver.rear) + reactionLayout.lookAhead
  return (
    along > -1 &&
    along < reach + pace * reactionLayout.lookTime &&
    Math.abs(aside) < driver.halfWidth + who.radius + reactionLayout.lane * 0.5
  )
}

export function struck(driver: Driver, who: Bystander) {
  if (Math.abs(driver.speed) < reactionLayout.knock || heft[who.kind] >= 1) return false
  const { ahead, aside } = carFrame(driver, who.x, who.s)
  return (
    ahead < driver.front + who.radius * 0.6 &&
    ahead > -driver.rear - who.radius * 0.6 &&
    Math.abs(aside) < driver.halfWidth + who.radius * 0.6
  )
}

export function alarm(fate: Fate, time: number, lasting: number, delay: number) {
  if (fate.fallen) return false
  const fresh = time >= fate.until
  if (fresh) fate.from = time + delay
  fate.until = Math.max(fate.until, time + delay + lasting)
  return fresh
}

export function flee(
  fate: Fate,
  kind: Creature,
  driver: Driver,
  x: number,
  s: number,
  outward: { x: number; s: number },
  time: number,
  dt: number,
) {
  const running = time >= fate.from && time < fate.until
  if (running) {
    const awayX = x - driver.x
    const awayS = s - driver.s
    const gap = Math.hypot(awayX, awayS) || 1
    let headX = awayX / gap + outward.x * 0.9
    let headS = awayS / gap + outward.s * 0.9
    const length = Math.hypot(headX, headS) || 1
    headX /= length
    headS /= length
    const turn = 1 - Math.exp(-dt * 9)
    fate.headX += (headX - fate.headX) * turn
    fate.headS += (headS - fate.headS) * turn
    const strayed = Math.hypot(fate.dx, fate.ds)
    const pace = fleePace[kind] * Math.max(0, 1 - strayed / reactionLayout.farthest)
    fate.dx += fate.headX * pace * dt
    fate.ds += fate.headS * pace * dt
    return pace
  }
  const strayed = Math.hypot(fate.dx, fate.ds)
  if (strayed > 0 && time >= fate.until + 2) {
    const step = Math.min(strayed, reactionLayout.returnPace * dt)
    fate.headX = -fate.dx / strayed
    fate.headS = -fate.ds / strayed
    fate.dx += fate.headX * step
    fate.ds += fate.headS * step
    return strayed > step ? -reactionLayout.returnPace : 0
  }
  return 0
}

export function fall(driver: Driver, x: number, s: number, yaw: number, time: number): Fall {
  const facing = Math.sign(driver.speed) || 1
  const { aside } = carFrame(driver, x, s)
  const sin = Math.sin(driver.yaw)
  const cos = Math.cos(driver.yaw)
  const glance = Math.max(-0.5, Math.min(0.5, aside * 0.35))
  const dirX = -sin * facing + cos * glance
  const dirS = cos * facing + sin * glance
  const length = Math.hypot(dirX, dirS) || 1
  return {
    x,
    s,
    dirX: dirX / length,
    dirS: dirS / length,
    reach: Math.min(reactionLayout.throwLimit, Math.abs(driver.speed) * reactionLayout.throwReach),
    yaw,
    at: time,
  }
}

export function fallenPose(down: Fall, time: number) {
  const age = Math.max(0, time - down.at)
  const part = Math.min(1, age / reactionLayout.throwTime)
  const slid = 1 - (1 - part) * (1 - part)
  return {
    x: down.x + down.dirX * down.reach * slid,
    s: down.s + down.dirS * down.reach * slid,
    lift: Math.sin(Math.PI * part) * Math.min(1.1, down.reach * 0.16),
    tip: Math.min(1, age / (reactionLayout.throwTime * 0.55)),
    pool: Math.max(0, Math.min(1, (age - reactionLayout.throwTime) / reactionLayout.stain)),
    age,
  }
}
