
export function SortHeader({ label, active, direction, onSort, numeric = false }) {
  const ariaSort = active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th scope="col" aria-sort={ariaSort} className={numeric ? 'num' : undefined}>
      <button type="button" className="sort-btn" onClick={onSort}>
        {label}
        <span aria-hidden="true" className="sort-mark">
          {active ? (direction === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}
