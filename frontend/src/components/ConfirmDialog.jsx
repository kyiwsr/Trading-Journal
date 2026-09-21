import { useEffect, useId, useRef, type ReactNode } from 'react'

import { Button } from './Button'

type Props = {
  open: boolean
  title: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}

// The native dialog gives the focus trap and the Escape key for free.
export function ConfirmDialog({ open, title, confirmLabel, cancelLabel, destructive, onConfirm, onCancel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
