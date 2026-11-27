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
import type { Vehicle } from '../game/world'

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
export const qualities = [
  { id: 'low', label: 'Easy on the engine' },
  { id: 'high', label: 'Full beauty' },
  { id: 'ultra', label: 'Ultra' },
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
export const driverAids = [
  {
    id: 'antilock',
    label: 'Antilock brakes (ABS)',
    description:
      'Keeps the wheels turning under hard braking so the car still steers. Without it a firm stop locks the wheels, the car slides straight on and needs noticeably more road to stop.',
  },
  {
    id: 'brakeDistribution',
    label: 'Brake force distribution (EBD)',
    description:
      'Shares the braking between the wheels by the weight each one carries, so the light inside and rear wheels do not give up first in a bend. Without it the brakes split at a fixed front to rear ratio.',
  },
  {
    id: 'tractionControl',
    label: 'Traction control (TCS)',
    description:
      'Eases the power when the driven wheels start to spin. Without it full throttle on a wet road, snow or loose ground spins the wheels, smokes the tyres and can step the tail out.',
  },
] as const
export const drivetrainNote: Record<Vehicle, string> = {
  touring: 'The grand tourer drives its rear wheels.',
  roadster: 'The roadster drives its rear wheels.',
  hatchback: 'The city hatchback drives its front wheels.',
  supercar: 'The supercar drives all four wheels.',
  pickup: 'The trail pickup drives all four wheels.',
  motorcycle: 'The motorcycle drives its rear wheel.',
  bus: 'The wanderer bus drives its rear wheels.',
}
