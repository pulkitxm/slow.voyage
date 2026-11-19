import type { LoftArch, LoftSpec, LoftStation } from './loft-body'
import { tireDimensions } from './tire-dimensions'
import { vehicleMetrics } from './vehicles'
import type { Vehicle } from './world'

export type LoftVehicleId = 'pickup' | 'hatchback' | 'supercar'
export type DetailMaterial = 'paint' | 'glass' | 'trim' | 'metal' | 'brake' | 'lights' | 'plate'

export interface LoftDecal {
  outline: readonly (readonly [number, number])[]
  axis: 'x' | 'z'
  direction: 1 | -1
  material: DetailMaterial
  lift: number
  mirror?: boolean
}

export interface LoftPart {
  shape: 'box' | 'cylinder'
  size: readonly [number, number, number]
  position: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  material: DetailMaterial
  mirror?: boolean
}

export interface LoftVehicle {
  body: LoftSpec
  decals: readonly LoftDecal[]
  parts: readonly LoftPart[]
  headlights: readonly [number, number, number]
  cowl: number
  seat: { x: number; y: number; z: number }
  dash: { reach: number }
  chase: { distance: number; height: number }
  spokes: number
}

type Row = [
  z: number,
  half: number,
  floor: number,
  belt: number,
  edge: number,
  top: number,
  crown: number,
  bow: number,
  inner?: number,
  deck?: number,
]

function stations(rows: readonly Row[]): LoftStation[] {
  return rows.map(([z, half, floor, belt, edge, top, crown, bow, inner, deck]) => ({
    z,
    half,
    floor,
    belt,
    edge,
    top,
    crown,
    bow,
    ...(inner === undefined ? {} : { inner }),
    ...(deck === undefined ? {} : { deck }),
  }))
}

export function loftArches(vehicle: Vehicle, clearance: number): LoftArch[] {
  const metrics = vehicleMetrics[vehicle],
    tire = tireDimensions[vehicle]
  const sweep =
    metrics.wheelRadius * Math.sin(metrics.maxSteering) +
    tire.width * 0.5 * Math.cos(metrics.maxSteering)
  return [-0.5, 0.5].map((side) => ({
    z: side * metrics.wheelbase,
    height: metrics.wheelRadius,
    reach: metrics.wheelRadius + clearance,
    rise: metrics.wheelRadius + metrics.suspensionTravel + 0.035,
    inset: metrics.trackWidth * 0.5 - sweep - 0.02,
  }))
}

function seam(z: number, low: number, high: number): LoftDecal {
  return {
    outline: [
      [z - 0.007, low],
      [z + 0.007, low],
      [z + 0.007, high],
      [z - 0.007, high],
    ],
    axis: 'x',
    direction: 1,
    material: 'trim',
    lift: 0.004,
    mirror: true,
  }
}

const hatchback: LoftVehicle = {
  body: {
    stations: stations([
      [-1.88, 0.73, 0.25, 0.62, 0.65, 0.67, 0.01, 0.1],
      [-1.85, 0.775, 0.2, 0.67, 0.67, 0.72, 0.015, 0.1],
      [-1.72, 0.79, 0.18, 0.71, 0.67, 0.765, 0.03, 0.07],
      [-1.52, 0.8, 0.17, 0.76, 0.68, 0.81, 0.035, 0],
      [-1.15, 0.8, 0.17, 0.82, 0.68, 0.86, 0.04, 0],
      [-0.8, 0.8, 0.17, 0.86, 0.68, 0.895, 0.04, 0],
      [-0.77, 0.8, 0.17, 0.86, 0.675, 0.93, 0.04, 0],
      [-0.15, 0.8, 0.17, 0.89, 0.57, 1.4, 0.04, 0],
      [0.45, 0.8, 0.17, 0.9, 0.57, 1.445, 0.045, 0],
      [1.2, 0.8, 0.17, 0.92, 0.56, 1.425, 0.04, 0],
      [1.28, 0.8, 0.17, 0.92, 0.57, 1.39, 0.035, 0],
      [1.6, 0.8, 0.17, 0.92, 0.66, 0.99, 0.02, -0.02],
      [1.7, 0.79, 0.19, 0.8, 0.69, 0.86, 0.01, -0.05],
      [1.78, 0.76, 0.24, 0.62, 0.68, 0.7, 0, -0.09],
      [1.82, 0.68, 0.32, 0.5, 0.6, 0.58, 0, -0.12],
    ]),
    arches: loftArches('hatchback', 0.06),
    panels: [
      { from: -0.77, to: -0.15, bands: ['top'], material: 'glass' },
      { from: -0.74, to: 1.04, bands: ['belt'], material: 'trim' },
      { from: -0.72, to: 0.28, bands: ['upper'], material: 'glass' },
      { from: 0.28, to: 0.36, bands: ['upper'], material: 'trim' },
      { from: 0.36, to: 1.02, bands: ['upper'], material: 'glass' },
      { from: 1.3, to: 1.58, bands: ['top'], material: 'glass' },
    ],
    tuck: 0.05,
    radii: { sill: 0.05, belt: 0.03, rail: 0.07, gutter: 0.03 },
    spacing: 0.14,
  },
  decals: [
    seam(-0.66, 0.26, 0.85),
    seam(0.32, 0.24, 0.88),
    seam(0.88, 0.6, 0.89),
    {
      outline: [
        [-0.27, 0.58],
        [0.27, 0.58],
        [0.29, 0.62],
        [-0.29, 0.62],
      ],
      axis: 'z',
      direction: -1,
      material: 'trim',
      lift: 0.01,
    },
    {
      outline: [
        [0.36, 0.62],
        [0.71, 0.65],
        [0.73, 0.74],
        [0.4, 0.71],
      ],
      axis: 'z',
      direction: -1,
      material: 'trim',
      lift: 0.01,
      mirror: true,
    },
    {
      outline: [
        [0.39, 0.64],
        [0.69, 0.665],
        [0.705, 0.72],
        [0.42, 0.695],
      ],
      axis: 'z',
      direction: -1,
      material: 'lights',
      lift: 0.018,
      mirror: true,
    },
    {
      outline: [
        [-0.5, 0.33],
        [0.5, 0.33],
        [0.46, 0.46],
        [-0.46, 0.46],
      ],
      axis: 'z',
      direction: -1,
      material: 'trim',
      lift: 0.01,
    },
    {
      outline: [
        [0.5, 0.72],
        [0.73, 0.74],
        [0.73, 0.9],
        [0.56, 0.88],
      ],
      axis: 'z',
      direction: 1,
      material: 'brake',
      lift: 0.012,
      mirror: true,
    },
    {
      outline: [
        [-0.2, 0.56],
        [0.2, 0.56],
        [0.2, 0.67],
        [-0.2, 0.67],
      ],
      axis: 'z',
      direction: 1,
      material: 'plate',
      lift: 0.012,
    },
    {
      outline: [
        [-0.56, 0.35],
        [0.56, 0.35],
        [0.52, 0.47],
        [-0.52, 0.47],
      ],
      axis: 'z',
      direction: 1,
      material: 'trim',
      lift: 0.01,
    },
  ],
  parts: [
    {
      shape: 'box',
      size: [0.15, 0.1, 0.08],
      position: [0.85, 0.94, -0.6],
      material: 'paint',
      mirror: true,
    },
    {
      shape: 'box',
      size: [0.018, 0.028, 0.13],
      position: [0.802, 0.8, -0.02],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'box',
      size: [0.018, 0.028, 0.13],
      position: [0.802, 0.82, 0.78],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'cylinder',
      size: [0.028, 0.028, 0.1],
      position: [0.42, 0.26, 1.8],
      rotation: [Math.PI / 2, 0, 0],
      material: 'metal',
    },
  ],
  headlights: [0.55, 0.69, -1.82],
  cowl: -0.8,
  seat: { x: -0.33, y: 1.2, z: -0.05 },
  dash: { reach: 0.62 },
  chase: { distance: 4, height: 1.95 },
  spokes: 7,
}

const supercar: LoftVehicle = {
  body: {
    stations: stations([
      [-2.23, 0.64, 0.15, 0.27, 0.54, 0.305, 0, 0.24],
      [-2.16, 0.8, 0.12, 0.34, 0.66, 0.39, 0, 0.22],
      [-1.95, 0.92, 0.11, 0.5, 0.76, 0.55, -0.02, 0.12],
      [-1.71, 0.96, 0.11, 0.7, 0.8, 0.74, -0.06, 0],
      [-1.3, 0.97, 0.11, 0.8, 0.82, 0.84, -0.11, 0],
      [-0.9, 0.96, 0.11, 0.8, 0.78, 0.835, -0.06, 0],
      [-0.72, 0.95, 0.11, 0.8, 0.74, 0.83, -0.02, 0],
      [-0.69, 0.95, 0.11, 0.8, 0.735, 0.86, 0, 0],
      [0.05, 0.93, 0.11, 0.82, 0.5, 1.12, 0.025, 0],
      [0.45, 0.93, 0.11, 0.84, 0.5, 1.125, 0.025, 0],
      [0.9, 0.96, 0.11, 0.88, 0.6, 1.03, 0, 0],
      [1.3, 0.97, 0.11, 0.9, 0.72, 0.96, -0.01, 0],
      [1.7, 0.97, 0.12, 0.88, 0.8, 0.92, -0.02, 0],
      [2, 0.95, 0.18, 0.84, 0.8, 0.885, -0.02, -0.03],
      [2.12, 0.9, 0.28, 0.74, 0.78, 0.8, 0, -0.08],
      [2.16, 0.8, 0.36, 0.6, 0.7, 0.7, 0, -0.12],
    ]),
    arches: loftArches('supercar', 0.055),
    panels: [
      { from: -0.9, to: 0.9, bands: ['sill'], material: 'trim' },
      { from: -0.69, to: 0.05, bands: ['top'], material: 'glass' },
      { from: -0.62, to: 0.42, bands: ['upper'], material: 'glass' },
      { from: 0.52, to: 1.15, bands: ['top'], material: 'glass' },
    ],
    tuck: 0.06,
    radii: { sill: 0.05, belt: 0.05, rail: 0.06, gutter: 0.03 },
    spacing: 0.14,
  },
  decals: [
    seam(-0.6, 0.2, 0.78),
    seam(0.48, 0.2, 0.82),
    {
      outline: [
        [0.5, 0.52],
        [0.76, 0.61],
        [0.78, 0.66],
        [0.55, 0.585],
      ],
      axis: 'z',
      direction: -1,
      material: 'lights',
      lift: 0.012,
      mirror: true,
    },
    {
      outline: [
        [0.28, 0.19],
        [0.68, 0.22],
        [0.64, 0.32],
        [0.32, 0.3],
      ],
      axis: 'z',
      direction: -1,
      material: 'trim',
      lift: 0.01,
      mirror: true,
    },
    {
      outline: [
        [-0.74, 0.72],
        [0.74, 0.72],
        [0.74, 0.765],
        [-0.74, 0.765],
      ],
      axis: 'z',
      direction: 1,
      material: 'brake',
      lift: 0.012,
    },
    {
      outline: [
        [-0.6, 0.4],
        [0.6, 0.4],
        [0.56, 0.56],
        [-0.56, 0.56],
      ],
      axis: 'z',
      direction: 1,
      material: 'trim',
      lift: 0.01,
    },
    {
      outline: [
        [0.52, 0.42],
        [0.95, 0.36],
        [0.95, 0.68],
        [0.64, 0.64],
      ],
      axis: 'x',
      direction: 1,
      material: 'trim',
      lift: 0.01,
      mirror: true,
    },
  ],
  parts: [
    {
      shape: 'box',
      size: [0.16, 0.07, 0.09],
      position: [0.97, 0.9, -0.42],
      material: 'paint',
      mirror: true,
    },
    {
      shape: 'box',
      size: [1.62, 0.028, 0.26],
      position: [0, 1.04, 2.04],
      material: 'paint',
    },
    {
      shape: 'box',
      size: [0.035, 0.18, 0.16],
      position: [0.55, 0.95, 2.0],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'cylinder',
      size: [0.045, 0.045, 0.1],
      position: [0.2, 0.48, 2.15],
      rotation: [Math.PI / 2, 0, 0],
      material: 'metal',
      mirror: true,
    },
  ],
  headlights: [0.65, 0.6, -1.95],
  cowl: -0.72,
  seat: { x: -0.36, y: 1.07, z: -0.22 },
  dash: { reach: 0.52 },
  chase: { distance: 4.5, height: 1.8 },
  spokes: 10,
}

const pickup: LoftVehicle = {
  body: {
    stations: stations([
      [-2.6, 0.88, 0.56, 1.04, 0.8, 1.1, 0, 0.06],
      [-2.56, 0.94, 0.46, 1.1, 0.84, 1.17, 0.015, 0.06],
      [-2.42, 0.97, 0.36, 1.15, 0.86, 1.22, 0.03, 0.04],
      [-2.12, 0.975, 0.33, 1.17, 0.86, 1.235, 0.035, 0],
      [-1.6, 0.975, 0.33, 1.19, 0.86, 1.25, 0.04, 0],
      [-1.02, 0.975, 0.33, 1.2, 0.86, 1.26, 0.04, 0],
      [-0.99, 0.975, 0.33, 1.2, 0.855, 1.29, 0.04, 0],
      [-0.5, 0.975, 0.33, 1.21, 0.74, 1.8, 0.04, 0],
      [0, 0.975, 0.33, 1.21, 0.74, 1.835, 0.045, 0],
      [0.52, 0.975, 0.33, 1.21, 0.74, 1.815, 0.04, 0],
      [0.535, 0.975, 0.33, 1.21, 0.745, 1.74, 0, 0],
      [0.55, 0.975, 0.33, 1.21, 0.8, 1.3, 0, 0],
      [0.565, 0.975, 0.33, 1.2, 0.935, 1.245, 0, 0, 0.87, 0.72],
      [2.58, 0.975, 0.33, 1.2, 0.935, 1.245, 0, 0, 0.87, 0.72],
      [2.6, 0.975, 0.34, 1.2, 0.935, 1.245, 0, 0, 0.87, 1.245],
      [2.68, 0.97, 0.4, 1.18, 0.92, 1.235, 0, -0.02, 0.87, 1.235],
      [2.72, 0.9, 0.52, 1.06, 0.85, 1.12, 0, -0.05, 0.8, 1.12],
    ]),
    arches: loftArches('pickup', 0.09),
    panels: [
      { from: -2.6, to: 2.72, bands: ['sill'], material: 'trim' },
      { from: -0.99, to: -0.5, bands: ['top'], material: 'glass' },
      { from: -0.94, to: -0.08, bands: ['upper'], material: 'glass' },
      { from: -0.08, to: 0, bands: ['upper'], material: 'trim' },
      { from: 0, to: 0.44, bands: ['upper'], material: 'glass' },
      { from: 0.535, to: 0.55, bands: ['top'], material: 'glass' },
      { from: 0.565, to: 2.6, bands: ['drop', 'gutter', 'top'], material: 'trim' },
    ],
    tuck: 0.03,
    radii: { sill: 0.04, belt: 0.04, rail: 0.06, gutter: 0.03 },
    spacing: 0.16,
  },
  decals: [
    seam(-0.98, 0.44, 1.18),
    seam(-0.04, 0.42, 1.18),
    seam(0.46, 0.42, 1.18),
    {
      outline: [
        [-0.52, 0.72],
        [0.52, 0.72],
        [0.55, 1.03],
        [-0.55, 1.03],
      ],
      axis: 'z',
      direction: -1,
      material: 'trim',
      lift: 0.012,
    },
    {
      outline: [
        [0.59, 0.88],
        [0.79, 0.88],
        [0.79, 1.03],
        [0.59, 1.03],
      ],
      axis: 'z',
      direction: -1,
      material: 'lights',
      lift: 0.014,
      mirror: true,
    },
    {
      outline: [
        [0.78, 0.86],
        [0.92, 0.86],
        [0.92, 1.16],
        [0.78, 1.16],
      ],
      axis: 'z',
      direction: 1,
      material: 'brake',
      lift: 0.012,
      mirror: true,
    },
    {
      outline: [
        [-0.2, 0.66],
        [0.2, 0.66],
        [0.2, 0.78],
        [-0.2, 0.78],
      ],
      axis: 'z',
      direction: 1,
      material: 'plate',
      lift: 0.012,
    },
  ],
  parts: [
    {
      shape: 'box',
      size: [1.82, 0.2, 0.16],
      position: [0, 0.56, -2.6],
      material: 'metal',
    },
    { shape: 'box', size: [1.06, 0.03, 0.03], position: [0, 0.8, -2.612], material: 'metal' },
    { shape: 'box', size: [1.08, 0.03, 0.03], position: [0, 0.875, -2.612], material: 'metal' },
    { shape: 'box', size: [1.1, 0.03, 0.03], position: [0, 0.95, -2.612], material: 'metal' },
    {
      shape: 'box',
      size: [1.82, 0.17, 0.16],
      position: [0, 0.52, 2.71],
      material: 'metal',
    },
    {
      shape: 'box',
      size: [0.09, 0.22, 0.14],
      position: [1.04, 1.36, -0.84],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'box',
      size: [0.1, 0.03, 0.05],
      position: [0.99, 1.3, -0.84],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'box',
      size: [0.13, 0.04, 1.5],
      position: [0.99, 0.36, -0.25],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'box',
      size: [0.02, 0.03, 0.14],
      position: [0.978, 1.1, -0.2],
      material: 'trim',
      mirror: true,
    },
    {
      shape: 'box',
      size: [0.4, 0.035, 0.02],
      position: [0, 1.1, 2.725],
      material: 'trim',
    },
  ],
  headlights: [0.69, 0.96, -2.6],
  cowl: -1.02,
  seat: { x: -0.42, y: 1.71, z: -0.12 },
  dash: { reach: 0.7 },
  chase: { distance: 5.6, height: 2.6 },
  spokes: 6,
}

export const loftVehicles: Record<LoftVehicleId, LoftVehicle> = { pickup, hatchback, supercar }

export function isLoftVehicle(vehicle: Vehicle): vehicle is LoftVehicleId {
  return vehicle in loftVehicles
}
