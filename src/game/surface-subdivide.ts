import * as THREE from 'three'

export function subdividePlanarSurface(source: THREE.BufferGeometry, edgeLength: number) {
  if (!Number.isFinite(edgeLength) || edgeLength <= 0)
    throw new Error('Surface edge length must be positive and finite')
  const attribute = source.getAttribute('position')
  const points: [number, number][] = Array.from({ length: attribute.count }, (_, index) => [
    attribute.getX(index),
    attribute.getY(index),
  ])
  let triangles = source.index
    ? Array.from(source.index.array)
    : Array.from({ length: attribute.count }, (_, index) => index)
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  for (;;) {
    const midpoints = new Map<string, number>()
    for (let index = 0; index < triangles.length; index += 3) {
      for (let edge = 0; edge < 3; edge++) {
        const a = triangles[index + edge]
        const b = triangles[index + ((edge + 1) % 3)]
        if (a === undefined || b === undefined) throw new Error('Surface triangle is incomplete')
        const left = points[a]
        const right = points[b]
        if (!left || !right) throw new Error('Surface vertex is missing')
        const key = edgeKey(a, b)
        if (midpoints.has(key) || Math.hypot(left[0] - right[0], left[1] - right[1]) <= edgeLength)
          continue
        midpoints.set(key, points.length)
        points.push([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2])
      }
    }
    if (!midpoints.size) break
    const refined: number[] = []
    for (let index = 0; index < triangles.length; index += 3) {
      let a = triangles[index]
      let b = triangles[index + 1]
      let c = triangles[index + 2]
      if (a === undefined || b === undefined || c === undefined)
        throw new Error('Surface triangle is incomplete')
      let ab = midpoints.get(edgeKey(a, b))
      let bc = midpoints.get(edgeKey(b, c))
      let ca = midpoints.get(edgeKey(c, a))
      const count = Number(ab !== undefined) + Number(bc !== undefined) + Number(ca !== undefined)
      if (count === 0) refined.push(a, b, c)
      else if (count === 3 && ab !== undefined && bc !== undefined && ca !== undefined)
        refined.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
      else {
        while (ab === undefined || (count === 2 && bc === undefined)) {
          ;[a, b, c] = [b, c, a]
          ;[ab, bc, ca] = [bc, ca, ab]
        }
        if (count === 1) refined.push(a, ab, c, ab, b, c)
        else if (bc !== undefined) refined.push(ab, b, bc, a, ab, c, ab, bc, c)
      }
    }
    triangles = refined
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      points.flatMap(([x, y]) => [x, y, 0]),
      3,
    ),
  )
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(new Float32Array(points.length * 3), 3),
  )
  geometry.setIndex(triangles)
  return geometry
}
