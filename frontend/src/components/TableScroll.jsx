
// A focusable region so keyboard users can scroll a wide table sideways.
export function TableScroll({ label, children }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
