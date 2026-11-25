import { expect, test } from 'bun:test'
import * as THREE from 'three'
import { Particles, particleBudget, particleKind } from './particles'

test('particles reuse their slots once the pool for the quality level is full', () => {
  const particles = new Particles({ value: null })
  const tone = new THREE.Color('#ffffff')
  const emit = () =>
    particles.emit(particleKind.smoke, 0, 0, 0, 0, 1, 0, 2, 0.5, 3, 0.2, tone, 0.4, 1)
  expect(emit()).toBe(-1)
  particles.setLevel('high')
  const slots = new Set<number>()
  for (let index = 0; index < particleBudget.high.capacity + 5; index++) slots.add(emit())
  expect(slots.size).toBe(particleBudget.high.capacity)
  expect(emit()).toBe(5)
  expect(particles.mesh.geometry.instanceCount).toBe(particleBudget.high.capacity)
  particles.setLevel('ultra')
  expect(particles.mesh.geometry.instanceCount).toBe(particleBudget.ultra.capacity)
  expect(particleBudget.ultra.capacity).toBeGreaterThan(particleBudget.high.capacity)
  particles.setLevel('off')
  expect(particles.mesh.visible).toBe(false)
  expect(emit()).toBe(-1)
  particles.dispose()
})
