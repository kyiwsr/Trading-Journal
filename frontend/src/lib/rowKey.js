let counter = 0

// Stable React keys for rows that have no id yet.
export const newRowKey = () => `row-${++counter}`
