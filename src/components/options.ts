import {
  BusFront,
  CarFront,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSun,
  Gauge,
  Leaf,
  Moon,
  Motorbike,
  Mountain,
  Snowflake,
  Sun,
  Sunset,
  Trees,
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
  { id: 'fog', label: 'Fog', icon: CloudFog },
] as const
export const daylight = [
  { id: 'day', label: 'Daylight', icon: CloudSun },
  { id: 'sunset', label: 'Golden hour', icon: Sunset },
  { id: 'night', label: 'Night', icon: Moon },
] as const
export const vehicles = [
  { id: 'touring', icon: CarFront },
  { id: 'roadster', icon: Gauge },
  { id: 'motorcycle', icon: Motorbike },
  { id: 'bus', icon: BusFront },
] as const
export const colors = ['#f8f8f8', '#6f8a77', '#b65a44', '#3b515c', '#c8aa66', '#343b39']
