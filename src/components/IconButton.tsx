import type { ReactNode } from 'react'
export function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
