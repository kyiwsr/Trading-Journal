import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, type Query } from './client'
import type {
  Account,
  Dashboard,
  FeeComponentInput,
  FeeProfile,
  FeeTemplate,
  Instrument,
  RangeName,
  Settings,
  Setup,
  TradeDetail,
  TradeList,
  TradePayload,
  User,
} from './types'

export const queryKeys = {
  me: ['me'] as const,
  accounts: (includeArchived = false) => ['accounts', { includeArchived }] as const,
  instruments: (includeArchived = false) => ['instruments', { includeArchived }] as const,
  feeProfiles: (includeArchived = false) => ['fee-profiles', { includeArchived }] as const,
  feeTemplates: ['fee-templates'] as const,
  setups: (includeArchived = false) => ['setups', { includeArchived }] as const,
  dashboard: (account: string, range: RangeName) => ['dashboard', account, range] as const,
  trades: (query: Query) => ['trades', query] as const,
  trade: (id: number) => ['trade', id] as const,
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<User>('/auth/me'), staleTime: 5 * 60_000 })
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.accounts(includeArchived),
    queryFn: () => api<Account[]>('/accounts', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useInstruments(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.instruments(includeArchived),
    queryFn: () =>
      api<Instrument[]>('/instruments', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useFeeProfiles(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.feeProfiles(includeArchived),
    queryFn: () =>
      api<FeeProfile[]>('/fee-profiles', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useFeeTemplates() {
  return useQuery({
    queryKey: queryKeys.feeTemplates,
    queryFn: () => api<FeeTemplate[]>('/fee-templates'),
    staleTime: Infinity,
  })
}

export function useSetups(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.setups(includeArchived),
    queryFn: () => api<Setup[]>('/setups', { query: { include_archived: includeArchived ? 'true' : undefined } }),
  })
}

export function useSetup(id: number) {
  return useQuery({
    queryKey: ['setup', id] as const,
    queryFn: () => api<Setup>(`/setups/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  })
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

// A change to any of these can move the ledger, the dashboard or a form's choices, so all are refetched.
const AFFECTED = [['settings'], ['trades'], ['trade'], ['dashboard'], ['accounts'], ['instruments'], ['fee-profiles'], ['setups'], ['setup']]

function useSaving<Vars, Data>(mutationFn: (vars: Vars) => Promise<Data>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(AFFECTED.map((queryKey) => client.invalidateQueries({ queryKey })))
    },
  })
}

export function useSaveTrade(id?: number) {
  return useSaving((body: TradePayload) =>
    id === undefined
      ? api<TradeDetail>('/trades', { method: 'POST', body })
      : api<TradeDetail>(`/trades/${id}`, { method: 'PUT', body }),
  )
}

export function useDeleteTrade() {
  return useSaving((id: number) => api<void>(`/trades/${id}`, { method: 'DELETE' }))
}

type SetupFields = { name: string; subtitle: string | null; description: string | null }
type CriterionInput = { id?: number; label: string; weight: string }

export function useCreateSetup() {
  return useSaving((body: SetupFields & { criteria: CriterionInput[] }) =>
    api<Setup>('/setups', { method: 'POST', body: { ...body, criteria: body.criteria.map(({ label, weight }) => ({ label, weight })) } }),
  )
}

export function useUpdateSetup(id: number) {
  return useSaving(async ({ fields, criteria }: { fields: SetupFields; criteria: CriterionInput[] }) => {
    await api<Setup>(`/setups/${id}`, { method: 'PATCH', body: fields })
    return api<Setup>(`/setups/${id}/criteria`, { method: 'PUT', body: criteria })
  })
}

export function useSetupArchive() {
  return useSaving(({ id, archive }: { id: number; archive: boolean }) =>
    api<Setup>(`/setups/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export type AccountFields = {
  name: string
  label: string | null
  broker_name: string | null
  route: string | null
  starting_balance: string
  currency: string
  fee_profile_id: number | null
}

export function useSaveAccount(id?: number) {
  return useSaving((body: AccountFields) =>
    id === undefined
      ? api<Account>('/accounts', { method: 'POST', body })
      : api<Account>(`/accounts/${id}`, { method: 'PATCH', body }),
  )
}

export function useAccountArchive() {
  return useSaving(({ id, archive }: { id: number; archive: boolean }) =>
    api<Account>(`/accounts/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export type InstrumentFields = { symbol: string; name: string | null; tick_size: string; tick_value: string }

export function useSaveInstrument(id?: number) {
  return useSaving((body: InstrumentFields) =>
    id === undefined
      ? api<Instrument>('/instruments', { method: 'POST', body })
      : api<Instrument>(`/instruments/${id}`, { method: 'PATCH', body }),
  )
}

export function useInstrumentArchive() {
  return useSaving(({ id, archive }: { id: number; archive: boolean }) =>
    api<Instrument>(`/instruments/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export type FeeProfileFields = { name: string; notes: string | null; components: FeeComponentInput[] }

export function useSaveFeeProfile(id?: number) {
  return useSaving((body: FeeProfileFields) =>
    id === undefined
      ? api<FeeProfile>('/fee-profiles', { method: 'POST', body })
      : api<FeeProfile>(`/fee-profiles/${id}`, { method: 'PATCH', body }),
  )
}

export function useFeeProfileFromTemplate() {
  return useSaving((body: { template_id: string; name?: string }) =>
    api<FeeProfile>('/fee-profiles/from-template', { method: 'POST', body }),
  )
}

export function useFeeProfileArchive() {
  return useSaving(({ id, archive }: { id: number; archive: boolean }) =>
    api<FeeProfile>(`/fee-profiles/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  )
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'] as const, queryFn: () => api<Settings>('/settings'), staleTime: 5 * 60_000 })
}

export function useSaveSettings() {
  return useSaving((body: { compliance_cutoff: number }) => api<Settings>('/settings', { method: 'PUT', body }))
}
