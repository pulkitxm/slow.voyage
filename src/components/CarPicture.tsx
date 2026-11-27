import type { LucideIcon } from 'lucide-react'

let pictures: Record<string, string> | null = null

function pictureFiles() {
  if (!pictures) {
    try {
      pictures = import.meta.glob<string>('../assets/models/cars/thumbs/*.webp', {
        query: '?url',
        import: 'default',
        eager: true,
      })
    } catch {
      pictures = {}
    }
  }
  return pictures
}

export function carPicture(id: string) {
  const files = pictureFiles()
  const base = files[`../assets/models/cars/thumbs/${id}.webp`]
  const mask = files[`../assets/models/cars/thumbs/${id}-mask.webp`]
  return base && mask ? { base, mask } : null
}

export function CarPicture({
  id,
  paint,
  icon: Icon,
}: {
  id: string
  paint: string
  icon?: LucideIcon
}) {
  const picture = carPicture(id)
  if (!picture) return <span className="car-picture is-icon">{Icon && <Icon size={34} />}</span>
  const mask = `url(${picture.mask})`
  return (
    <span className="car-picture">
      <img src={picture.base} alt="" loading="lazy" decoding="async" draggable={false} />
      <span
        className="car-picture-paint"
        style={{ backgroundColor: paint, maskImage: mask, WebkitMaskImage: mask }}
      />
    </span>
  )
}
