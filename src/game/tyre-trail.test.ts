import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { SkidMarks, TyreParticles, trailLayout } from './tyre-trail'

test('particles reuse their slots once the pool is full', () => {
  const particles = new TyreParticles()
  const tone = new THREE.Color('#ffffff')
  const origin = { x: 1, y: 2, z: 3 }
  const slots = new Set<number>()
  for (let index = 0; index < trailLayout.particles + 5; index++)
    slots.add(particles.emit(origin, origin, tone, 0.5, 1, index))
  expect(slots.size).toBe(trailLayout.particles)
  expect(particles.emit(origin, origin, tone, 0.5, 1, 0)).toBe(5)
  particles.dispose()
})

test('skid marks join steady slides and break on gaps, lifts and jumps', () => {
  const marks = new SkidMarks()
  expect(marks.trace(0, true, 0, 0, 0)).toBe(false)
  expect(marks.trace(0, true, 0.1, 0, 0)).toBe(false)
  expect(marks.trace(0, true, 0.6, 0, 0)).toBe(true)
  expect(marks.trace(0, true, 1.2, 0, 0)).toBe(true)
  expect(marks.trace(0, false, 1.8, 0, 0)).toBe(false)
  expect(marks.trace(0, true, 2.4, 0, 0)).toBe(false)
  expect(marks.trace(0, true, 3, 0, 0)).toBe(true)
  expect(marks.trace(0, true, 30, 0, 0)).toBe(false)
  expect(marks.trace(1, true, 5, 0, 5)).toBe(false)
  expect(marks.trace(1, true, 5, 0, 5.5)).toBe(true)
  expect(marks.written).toBe(4)
  const position = marks.mesh.geometry.getAttribute('position')
  expect(Math.abs(position.getZ(0) - position.getZ(1))).toBeCloseTo(trailLayout.markWidth, 6)
  expect(position.getX(2)).toBeCloseTo(0.6, 6)
  marks.clear()
  expect(position.getX(2)).toBe(0)
  marks.dispose()
})
