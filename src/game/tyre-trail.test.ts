import { expect, test } from 'bun:test'
import { SkidMarks, trailLayout } from './tyre-trail'

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
