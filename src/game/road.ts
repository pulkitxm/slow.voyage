export const roadLayout = {
  halfWidth: 3,
  shoulder: 0.4,
  verge: 0.8,
  surfaceRecess: 0.02,
  railOffset: 3.4,
  railClearance: 0.2,
  railSegmentLength: 5,
  edgeInset: 0.14,
  edgeWidth: 0.06,
  centerWidth: 0.12,
  dashLength: 3,
  dashPeriod: 6,
}

export function guardrailAt(
  world: { guardrail(s: number, side: number): boolean },
  s: number,
  side: number,
) {
  const midpoint =
    (Math.floor(s / roadLayout.railSegmentLength) + 0.5) * roadLayout.railSegmentLength
  return world.guardrail(midpoint, side)
}

export interface RoadSample {
  x: number
  y: number
  dx: number
  dy: number
  yaw: number
}

export function roadPoint(road: RoadSample, s: number, distance: number) {
  return {
    x: road.x + Math.cos(road.yaw) * distance,
    y: road.y,
    s: s + Math.sin(road.yaw) * distance,
  }
}

export function roadCoordinates(world: { road(s: number): RoadSample }, x: number, s: number) {
  let along = s
  let road = world.road(along)
  for (let iteration = 0; iteration < 5; iteration++) {
    const correction = ((x - road.x) * road.dx + s - along) / (1 + road.dx * road.dx)
    if (Math.abs(correction) < 0.000001) break
    along += correction
    road = world.road(along)
  }
  return {
    road,
    s: along,
    distance: (x - road.x) * Math.cos(road.yaw) + (s - along) * Math.sin(road.yaw),
  }
}
