import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

import { ConfirmDialog } from '../components'

// Blocks in-app navigation to another page, and closing the tab, while a form holds unsaved changes.
// Call allowLeave() right before navigating away after a successful save.
export function useLeaveGuard(dirty, subject) {
  const leaving = useRef(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  // Only a path change counts, so the header's account and range switches do not trigger it.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Discard unsaved changes?"
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      <p>This {subject} has changes that are not saved. If you leave now they are lost.</p>
    </ConfirmDialog>
  )

  return {
    allowLeave: () => {
      leaving.current = true
    },
    dialog,
  }
}
