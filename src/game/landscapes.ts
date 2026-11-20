export type Landscape = 'highlands' | 'alpine' | 'desert' | 'forest' | 'canyon' | 'fjord' | 'jungle'

type Tone = [number, number, number]

export interface LandscapeProfile {
  road: readonly [base: number, rise: number, crest: number]
  relief: number
  terrace: number
  passes: number
  coast: 'none' | 'side' | 'both'
  sand: boolean
  shore: boolean
  snowLine: number | null
  treeLine: number | null
  woodland: { threshold: number; evergreen: number; start: number; reach: number } | null
  roadside: { trees: number; shrubs: number; conifers: number; narrow: number }
  grass: number
  ground: { base: string; light: string } | null
  field: {
    dry: string
    dryness: number
    shade: Tone
    rock: string
    soil: string
    gravel: string
  } | null
  reflection: string | null
  foliage: string | null
  map: { low: Tone; high: Tone } | null
  falls: number
  palms: number
  boulders: number
  plants: number
}

export const landscapeProfiles: Record<Landscape, LandscapeProfile> = {
  highlands: {
    road: [24, 10, 3],
    relief: 1,
    terrace: 0,
    passes: 0,
    coast: 'side',
    sand: false,
    shore: true,
    snowLine: null,
    treeLine: null,
    woodland: { threshold: 0.08, evergreen: 0.3, start: 60, reach: 650 },
    roadside: { trees: 28, shrubs: 180, conifers: 0.3, narrow: 0.15 },
    grass: 10000,
    ground: null,
    field: null,
    reflection: null,
    foliage: null,
    map: null,
    falls: 3,
    palms: 0,
    boulders: 5,
    plants: 2,
  },
  alpine: {
    road: [100, 28, 8],
    relief: 2.4,
    terrace: 0,
    passes: 2,
    coast: 'none',
    sand: false,
    shore: true,
    snowLine: 120,
    treeLine: 220,
    woodland: { threshold: -0.02, evergreen: 0.7, start: 60, reach: 650 },
    roadside: { trees: 28, shrubs: 180, conifers: 0.7, narrow: 0.15 },
    grass: 10000,
    ground: null,
    field: null,
    reflection: null,
    foliage: null,
    map: null,
    falls: 7,
    palms: 0,
    boulders: 9,
    plants: 2,
  },
  desert: {
    road: [18, 4, 1],
    relief: 0.45,
    terrace: 0,
    passes: 0,
    coast: 'none',
    sand: true,
    shore: false,
    snowLine: null,
    treeLine: null,
    woodland: null,
    roadside: { trees: 4, shrubs: 12, conifers: 0, narrow: 0 },
    grass: 1200,
    ground: { base: '#c8ad7f', light: '#ddc291' },
    field: {
      dry: '#c5ae7b',
      dryness: 0.24,
      shade: [0.83, 0.77, 0.66],
      rock: '#9f8160',
      soil: '#a2855e',
      gravel: '#b39a75',
    },
    reflection: '#8d7554',
    foliage: '#ffc266',
    map: { low: [196, 168, 120], high: [226, 201, 152] },
    falls: 0,
    palms: 0,
    boulders: 7,
    plants: 4,
  },
  forest: {
    road: [34, 14, 4],
    relief: 1.15,
    terrace: 0,
    passes: 0,
    coast: 'none',
    sand: false,
    shore: true,
    snowLine: null,
    treeLine: null,
    woodland: { threshold: -0.42, evergreen: 0.82, start: 24, reach: 420 },
    roadside: { trees: 44, shrubs: 220, conifers: 0.8, narrow: 0.1 },
    grass: 9000,
    ground: null,
    field: null,
    reflection: '#3f5536',
    foliage: null,
    map: null,
    falls: 4,
    palms: 0,
    boulders: 4,
    plants: 6,
  },
  canyon: {
    road: [46, 16, 4],
    relief: 1.7,
    terrace: 26,
    passes: 2,
    coast: 'none',
    sand: false,
    shore: false,
    snowLine: null,
    treeLine: null,
    woodland: null,
    roadside: { trees: 3, shrubs: 46, conifers: 0, narrow: 0 },
    grass: 1600,
    ground: { base: '#b9714a', light: '#d99a66' },
    field: {
      dry: '#cfa06a',
      dryness: 0.3,
      shade: [0.86, 0.72, 0.6],
      rock: '#a8573a',
      soil: '#a9623f',
      gravel: '#b98866',
    },
    reflection: '#8a5236',
    foliage: '#ffbf66',
    map: { low: [176, 104, 68], high: [222, 158, 108] },
    falls: 2,
    palms: 0,
    boulders: 10,
    plants: 4,
  },
  fjord: {
    road: [9, 5, 1.6],
    relief: 1.25,
    terrace: 0,
    passes: 0,
    coast: 'both',
    sand: false,
    shore: true,
    snowLine: 62,
    treeLine: 54,
    woodland: { threshold: 0.2, evergreen: 0.9, start: 40, reach: 500 },
    roadside: { trees: 12, shrubs: 120, conifers: 0.85, narrow: 0.1 },
    grass: 7000,
    ground: { base: '#8a8f58', light: '#b4b077' },
    field: {
      dry: '#b5a467',
      dryness: 0.55,
      shade: [0.74, 0.78, 0.62],
      rock: '#7f8186',
      soil: '#77705a',
      gravel: '#a3a6a4',
    },
    reflection: '#59663f',
    foliage: '#f2e6a0',
    map: { low: [132, 140, 92], high: [186, 186, 138] },
    falls: 6,
    palms: 0,
    boulders: 8,
    plants: 4,
  },
  jungle: {
    road: [30, 12, 4],
    relief: 1.35,
    terrace: 0,
    passes: 0,
    coast: 'none',
    sand: false,
    shore: true,
    snowLine: null,
    treeLine: null,
    woodland: { threshold: -0.6, evergreen: 0.04, start: 16, reach: 520 },
    roadside: { trees: 56, shrubs: 400, conifers: 0, narrow: 0.3 },
    grass: 14000,
    ground: { base: '#4c7a33', light: '#7aa646' },
    field: {
      dry: '#8ba24c',
      dryness: 0.08,
      shade: [0.68, 0.82, 0.58],
      rock: '#5f5c4d',
      soil: '#5b4630',
      gravel: '#7a735e',
    },
    reflection: '#2f4a26',
    foliage: '#c4ffa0',
    map: { low: [66, 108, 52], high: [118, 158, 76] },
    falls: 8,
    palms: 34,
    boulders: 5,
    plants: 12,
  },
}

export const landscapeIds = Object.keys(landscapeProfiles) as Landscape[]

export function terraced(value: number, step: number, smooth: (t: number) => number) {
  if (!step) return value
  const scaled = value / step
  const level = Math.floor(scaled)
  const rise = smooth(Math.max(0, Math.min(1, (scaled - level - 0.3) / 0.4)))
  return value + ((level + rise) * step - value) * 0.68
}

export const passLayout = { floor: 0.13, core: 110, shoulder: 560 } as const

export function passEasing(
  s: number,
  lap: number,
  passes: number,
  seed: number,
  smooth: (t: number) => number,
) {
  if (!passes) return 1
  const spacing = lap / passes
  const local = ((s % lap) + lap) % lap
  let nearest = Number.POSITIVE_INFINITY
  for (let index = -1; index <= passes; index++) {
    const wrapped = ((index % passes) + passes) % passes
    const jitter = (Math.sin(seed * 12.9898 + wrapped * 78.233) * 43758.5453) % 1
    const center = (index + 0.5 + jitter * 0.3) * spacing
    nearest = Math.min(nearest, Math.abs(local - center))
  }
  const open =
    1 - smooth(Math.max(0, Math.min(1, (nearest - passLayout.core) / passLayout.shoulder)))
  return 1 - (1 - passLayout.floor) * open
}
