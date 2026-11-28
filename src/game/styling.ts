export const wheelStyles = ['factory', 'blade', 'mesh', 'turbine', 'monoblock'] as const
export type WheelStyle = (typeof wheelStyles)[number]

export const rimFinishes = ['silver', 'graphite', 'black', 'bronze'] as const
export type RimFinish = (typeof rimFinishes)[number]

export const exhausts = ['stock', 'sport'] as const
export type Exhaust = (typeof exhausts)[number]

export const wheelStyleNames: Record<WheelStyle, string> = {
  factory: 'Factory',
  blade: 'Twin blade',
  mesh: 'Cross mesh',
  turbine: 'Turbine',
  monoblock: 'Monoblock',
}

export const rimFinishNames: Record<RimFinish, string> = {
  silver: 'Silver',
  graphite: 'Graphite',
  black: 'Gloss black',
  bronze: 'Bronze',
}

export const rimFinishLooks: Record<
  RimFinish,
  { color: string; metalness: number; roughness: number }
> = {
  silver: { color: '#c9ced0', metalness: 0.85, roughness: 0.28 },
  graphite: { color: '#4a4f53', metalness: 0.75, roughness: 0.4 },
  black: { color: '#17191b', metalness: 0.4, roughness: 0.22 },
  bronze: { color: '#8a6a3e', metalness: 0.8, roughness: 0.34 },
}

export const exhaustNames: Record<Exhaust, string> = {
  stock: 'Stock',
  sport: 'Sport valved',
}

export const paintSwatches = [
  { color: '#a3211b', name: 'Rosso' },
  { color: '#c81e1e', name: 'Racing red' },
  { color: '#d9581c', name: 'Sunset orange' },
  { color: '#c8aa66', name: 'Champagne' },
  { color: '#e3c22f', name: 'Giallo' },
  { color: '#3f7d3a', name: 'Racing green' },
  { color: '#6f8a77', name: 'Sage' },
  { color: '#1f4f8f', name: 'Riviera blue' },
  { color: '#2d6f9c', name: 'Lagoon' },
  { color: '#3b515c', name: 'Slate' },
  { color: '#5a3a6e', name: 'Plum' },
  { color: '#b65a44', name: 'Terracotta' },
  { color: '#f8f8f8', name: 'Pearl white' },
  { color: '#9a9c9e', name: 'Silverstone' },
  { color: '#343b39', name: 'Graphite' },
  { color: '#111314', name: 'Midnight black' },
] as const
