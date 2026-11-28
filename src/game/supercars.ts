export const supercarModels = ['classic', 'grand', 'longtail', 'track'] as const
export type SupercarModel = (typeof supercarModels)[number]

export interface SupercarTrim {
  name: string
  engine: string
  tagline: string
  paint: string
}

export const supercarTrims: Record<SupercarModel, SupercarTrim> = {
  classic: {
    name: 'Corsa V12',
    engine: 'Mid-engine V12',
    tagline: 'The original wedge. High revs and a long, clean howl.',
    paint: '#a3211b',
  },
  grand: {
    name: 'Aurelia GT',
    engine: 'Front-engine twin-turbo six',
    tagline: 'Long bonnet, short tail. Crackles on every lift.',
    paint: '#1f4f8f',
  },
  longtail: {
    name: 'Strale Longtail',
    engine: 'Mid-engine flat-plane V8',
    tagline: 'Low, smooth and stretched for the fast roads.',
    paint: '#e8e6df',
  },
  track: {
    name: 'Furia R',
    engine: 'Mid-engine V10',
    tagline: 'Angular, light and loud. Built for the bends.',
    paint: '#c8aa66',
  },
}

export function supercarModelName(model: SupercarModel) {
  return supercarTrims[model].name
}
