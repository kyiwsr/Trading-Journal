import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Query } from './client'
import type { Account, Dashboard, RangeName, Setup, TradeDetail, TradeList, User } from './types'

export const queryKeys = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  setups: ['setups'] as const,
  dashboard: (account: string, range: RangeName) => ['dashboard', account, range] as const,
  trades: (query: Query) => ['trades', query] as const,
  trade: (id: number) => ['trade', id] as const,
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<User>('/auth/me'), staleTime: 5 * 60_000 })
}

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: () => api<Account[]>('/accounts') })
}

export function useSetups() {
  return useQuery({ queryKey: queryKeys.setups, queryFn: () => api<Setup[]>('/setups') })
}

export function useDashboard(account: string, range: RangeName) {
  return useQuery({
    queryKey: queryKeys.dashboard(account, range),
    queryFn: () => api<Dashboard>('/dashboard', { query: { account, range } }),
    placeholderData: keepPreviousData,
  })
}

export function useTrades(query: Query) {
  return useQuery({
    queryKey: queryKeys.trades(query),
    queryFn: () => api<TradeList>('/trades', { query }),
    placeholderData: keepPreviousData,
  })
}

export function useTrade(id: number) {
  return useQuery({
    queryKey: queryKeys.trade(id),
    queryFn: () => api<TradeDetail>(`/trades/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<User>('/auth/login', { method: 'POST', body }),
    onSuccess: (user) => client.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => client.clear(),
  })
}
