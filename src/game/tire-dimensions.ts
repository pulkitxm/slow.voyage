import { busLayout } from './bus-layout'
import type { Vehicle } from './world'

export interface TireDimensions {
  tube: number
  width: number
  inset: number
  radialSegments: number
  tubularSegments: number
}

const passenger: TireDimensions = {
  tube: 0.054,
  width: 0.1836,
  inset: 0,
  radialSegments: 12,
  tubularSegments: 32,
}

export const tireDimensions: Record<Vehicle, TireDimensions> = {
  touring: passenger,
  roadster: passenger,
  motorcycle: { tube: 0.0385, width: 0.077, inset: 0, radialSegments: 10, tubularSegments: 32 },
  bus: {
    tube: 0.065,
    width: busLayout.wheelWidth,
    inset: busLayout.wheelInset,
    radialSegments: 16,
    tubularSegments: 48,
  },
}
