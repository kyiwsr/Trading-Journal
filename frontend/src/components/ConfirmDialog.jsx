import { useEffect, useId, useRef } from 'react'

import { Button } from './Button'

// The native dialog gives the focus trap and the Escape key for free.
export function ConfirmDialog({ open, title, confirmLabel, cancelLabel, destructive, onConfirm, onCancel, children }) {
  const ref = useRef(null)
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
