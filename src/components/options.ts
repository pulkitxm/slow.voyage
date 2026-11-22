import {
  BusFront,
  CarFront,
  CarTaxiFront,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Gauge,
  History,
  Leaf,
  Moon,
  Motorbike,
  Mountain,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  TreePalm,
  TreePine,
  Trees,
  Truck,
  Waves,
  Zap,
} from 'lucide-react'

export { cameras } from '../game/settings'
export const landscapes = [
  {
    id: 'highlands',
    title: 'The Highlands',
    subtitle: 'Rolling hills. Open horizons.',
    icon: Trees,
  },
  {
    id: 'alpine',
    title: 'Alpine Pass',
    subtitle: 'A little closer to the clouds.',
    icon: Mountain,
  },
  { id: 'desert', title: 'Desert Highway', subtitle: 'Quiet sands. Endless skies.', icon: Sun },
  {
    id: 'forest',
    title: 'Old Forest',
    subtitle: 'Tall pines. Soft light.',
    icon: TreePine,
  },
  {
    id: 'canyon',
    title: 'Red Canyon',
    subtitle: 'Mesas and long shadows.',
    icon: Sunrise,
  },
  {
    id: 'fjord',
    title: 'Northern Lakes',
    subtitle: 'Still water. Snowy tops.',
    icon: Waves,
  },
  {
    id: 'jungle',
    title: 'Monsoon Jungle',
    subtitle: 'Thick canopy. Falling water.',
    icon: TreePalm,
  },
] as const
export const seasons = [
  { id: 'summer', label: 'Summer', icon: Sun },
  { id: 'autumn', label: 'Autumn', icon: Leaf },
  { id: 'winter', label: 'Winter', icon: Snowflake },
] as const
export const weather = [
  { id: 'clear', label: 'Clear', icon: Sun },
  { id: 'overcast', label: 'Overcast', icon: Cloud },
  { id: 'rain', label: 'Rain', icon: CloudRain },
  { id: 'storm', label: 'Storm', icon: CloudLightning },
  { id: 'fog', label: 'Fog', icon: CloudFog },
] as const
export const roadWear = [
  { id: 'fresh', label: 'Freshly laid' },
  { id: 'worn', label: 'Well travelled' },
  { id: 'broken', label: 'Potholed' },
] as const
export const life = [
  { id: 'none', label: 'Empty' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'lively', label: 'Lively' },
] as const
export const daylight = [
  { id: 'dawn', label: 'Dawn', icon: Sunrise, mood: 'First light' },
  { id: 'day', label: 'Daylight', icon: CloudSun, mood: 'A clear afternoon' },
  { id: 'sunset', label: 'Golden hour', icon: Sunset, mood: 'The golden hour' },
  { id: 'dusk', label: 'Dusk', icon: CloudMoon, mood: 'The blue hour' },
  { id: 'night', label: 'Night', icon: Moon, mood: 'Under the stars' },
  { id: 'cycle', label: 'Live sky', icon: History, mood: 'A whole day, passing' },
] as const
export const vehicles = [
  { id: 'touring', icon: CarFront },
  { id: 'roadster', icon: Gauge },
  { id: 'hatchback', icon: CarTaxiFront },
  { id: 'supercar', icon: Zap },
  { id: 'pickup', icon: Truck },
  { id: 'motorcycle', icon: Motorbike },
  { id: 'bus', icon: BusFront },
] as const
export const colors = [
  '#a3211b',
  '#f8f8f8',
  '#1f4f8f',
  '#6f8a77',
  '#b65a44',
  '#3b515c',
  '#c8aa66',
  '#343b39',
]
export const roadModes = [
  {
    id: 'winding',
    label: 'Winding Roads',
    description: 'Sweeping bends, tight corners and climbs. The road as it was made.',
  },
  {
    id: 'straight',
    label: 'Endless Straight',
    description:
      'No turns at all. The road holds its heading while hills, lakes and forests keep changing around you.',
  },
  {
    id: 'calm',
    label: 'Calm Drive',
    description:
      'Only long, wide curves and half as many walkers on the verge. Made for cruising and looking around.',
  },
] as const
export const steeringAssists = [
  {
    id: 'off',
    label: 'Free',
    description:
      'The steering answers with the same strength at any speed. A key turns the car as hard as the tyres allow, straight away.',
  },
  {
    id: 'light',
    label: 'Light assist',
    description:
      'At highway speed a tap only nudges the car within its lane and holding a key builds to full grip over about a second.',
  },
  {
    id: 'strong',
    label: 'Strong assist',
    description:
      'The calmest keys at speed. A tap drifts the car a hand width and a long hold eases into the bend.',
  },
] as const
