import type { Account } from '../api/types'

// The currency to show for the header's account choice: that account's own, or the shared one when "all" agree.
export function scopeCurrency(accounts: Account[] | undefined, accountScope: string): string | null {
  if (!accounts || accounts.length === 0) return null
  if (accountScope !== 'all') return accounts.find((account) => String(account.id) === accountScope)?.currency ?? null
  const codes = new Set(accounts.map((account) => account.currency))
  return codes.size === 1 ? [...codes][0] : null
}
