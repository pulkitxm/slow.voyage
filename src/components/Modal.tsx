import { type ReactNode, useEffect, useRef } from 'react'

export function Modal({
  children,
  titleId,
  onClose,
}: {
  children: ReactNode
  titleId?: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal-shell"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.repeat) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      {children}
    </dialog>
  )
}
