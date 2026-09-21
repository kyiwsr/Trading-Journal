
export function pageWindow(page, totalPages) {
  const last = Math.max(1, totalPages)
  const wanted = new Set([1, last, page - 1, page, page + 1])
  const pages = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b)
  const items = []
  pages.forEach((p, index) => {
    const previous = pages[index - 1]
    if (previous !== undefined && p - previous === 2) items.push(previous + 1)
    else if (previous !== undefined && p - previous > 2) items.push('gap')
    items.push(p)
  })
  return items
}

export function rangeLabel(page, pageSize, total) {
  if (total === 0) return '0 of 0'
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return `${from} to ${to} of ${total}`
}
