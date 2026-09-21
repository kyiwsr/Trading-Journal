import type { ReactNode } from 'react'

// A focusable region so keyboard users can scroll a wide table sideways.
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
