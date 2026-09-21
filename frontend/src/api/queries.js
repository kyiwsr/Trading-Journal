import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'

export const queryKeys = {
  me: ['me'],
  accounts: (includeArchived = false) => ['accounts', { includeArchived }],
  instruments: (includeArchived = false) => ['instruments', { includeArchived }],
  feeProfiles: (includeArchived = false) => ['fee-profiles', { includeArchived }],
  feeTemplates: ['fee-templates'],
  setups: (includeArchived = false) => ['setups', { includeArchived }],
  dashboard: (account, range) => ['dashboard', account, range],
  trades: (query) => ['trades', query],
  trade: (id) => ['trade', id],
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api('/auth/me'), staleTime: 5 * 60_000 })
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.accounts(includeArchived),
    queryFn: () => api('/accounts', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useInstruments(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.instruments(includeArchived),
    queryFn: () =>
      api('/instruments', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useFeeProfiles(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.feeProfiles(includeArchived),
    queryFn: () =>
      api('/fee-profiles', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useFeeTemplates() {
  return useQuery({
    queryKey: queryKeys.feeTemplates,
    queryFn: () => api('/fee-templates'),
    staleTime: Infinity,
  })
}

export function useSetups(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.setups(includeArchived),
    queryFn: () => api('/setups', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useSetup(id) {
  return useQuery({
    queryKey: ['setup', id],
    queryFn: () => api(`/setups/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useDashboard(account, range) {
  return useQuery({
    queryKey: queryKeys.dashboard(account, range),
    queryFn: () => api('/dashboard', { query: { account, range } }),
    placeholderData: keepPreviousData,
  })
}

export function useTrades(query) {
  return useQuery({
    queryKey: queryKeys.trades(query),
    queryFn: () => api('/trades', { query }),
    placeholderData: keepPreviousData,
  })
}

export function useTrade(id) {
  return useQuery({
    queryKey: queryKeys.trade(id),
    queryFn: () => api(`/trades/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/auth/login', { method: 'POST', body }),
    onSuccess: (user) => client.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => client.clear(),
  })
}

// A change to any of these can move the ledger, the dashboard or a form's choices, so all are refetched.
const AFFECTED = [['settings'], ['trades'], ['trade'], ['dashboard'], ['accounts'], ['instruments'], ['fee-profiles'], ['setups'], ['setup']]

function useSaving(mutationFn) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    // Inactive lists are refetched too, so the page we navigate to never flashes a stale copy.
    onSuccess: async () => {
      await Promise.all(AFFECTED.map((queryKey) => client.invalidateQueries({ queryKey, refetchType: 'all' })))
    },
  })
}

export function useSaveTrade(id) {
  return useSaving((body) =>
    id === undefined
      ? api('/trades', { method: 'POST', body })
      : api(`/trades/${id}`, { method: 'PUT', body }),
  )
}

export function useDeleteTrade() {
  return useSaving((id) => api(`/trades/${id}`, { method: 'DELETE' }))
}

export function useCreateSetup() {
  return useSaving((body) =>
    api('/setups', { method: 'POST', body: { ...body, criteria: body.criteria.map(({ label, weight }) => ({ label, weight })) } }),
  )
}

export function useUpdateSetup(id) {
  return useSaving(async ({ fields, criteria }) => {
    await api(`/setups/${id}`, { method: 'PATCH', body: fields })
    return api(`/setups/${id}/criteria`, { method: 'PUT', body: criteria })
  })
}

export function useSetupArchive() {
  return useSaving(({ id, archive }) =>
    api(`/setups/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export function useSaveAccount(id) {
  return useSaving((body) =>
    id === undefined
      ? api('/accounts', { method: 'POST', body })
      : api(`/accounts/${id}`, { method: 'PATCH', body }),
  )
}

export function useAccountArchive() {
  return useSaving(({ id, archive }) =>
    api(`/accounts/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export function useSaveInstrument(id) {
  return useSaving((body) =>
    id === undefined
      ? api('/instruments', { method: 'POST', body })
      : api(`/instruments/${id}`, { method: 'PATCH', body }),
  )
}

export function useInstrumentArchive() {
  return useSaving(({ id, archive }) =>
    api(`/instruments/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export function useSaveFeeProfile(id) {
  return useSaving((body) =>
    id === undefined
      ? api('/fee-profiles', { method: 'POST', body })
      : api(`/fee-profiles/${id}`, { method: 'PATCH', body }),
  )
}

export function useFeeProfileFromTemplate() {
  return useSaving((body) =>
    api('/fee-profiles/from-template', { method: 'POST', body }),
  )
}

export function useFeeProfileArchive() {
  return useSaving(({ id, archive }) =>
    api(`/fee-profiles/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api('/settings'), staleTime: 5 * 60_000 })
}

export function useSaveSettings() {
  return useSaving((body) => api('/settings', { method: 'PUT', body }))
}
