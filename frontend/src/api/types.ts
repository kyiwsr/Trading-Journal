// The API serializes decimals as strings; convert at the edge of a component, never in state.
export type Dec = string

export type Direction = 'long' | 'short'
export type Result = 'win' | 'loss' | 'breakeven'
export type Band = 'elite' | 'solid' | 'sub_optimal' | 'rule_breach'
export type SetupRank = 'elite' | 'solid' | 'negative_edge'
export type RangeName = '30D' | '90D' | 'YTD' | 'ALL'
export type SortField = 'closed_at' | 'opened_at' | 'net_pnl' | 'r_multiple' | 'execution_score'
export type Order = 'asc' | 'desc'

export type User = { id: number; email: string }

export type Account = {
  id: number
  name: string
  label: string | null
  broker_name: string | null
  route: string | null
  starting_balance: Dec
  currency: string
  fee_profile_id: number | null
  archived_at: string | null
  created_at: string
}

export type Criterion = { id: number; label: string; weight: Dec; display_order: number }

export type Setup = {
  id: number
  name: string
  subtitle: string | null
  description: string | null
  archived_at: string | null
  created_at: string
  criteria: Criterion[]
}

export type SetupBrief = { id: number; name: string; subtitle: string | null }

export type TradeListItem = {
  id: number
  account_id: number
  opened_at: string
  closed_at: string
  session: string | null
  symbol: string
  instrument_name: string | null
  direction: Direction
  setup: SetupBrief | null
  entry_fills: number
  exit_fills: number
  quantity: Dec
  avg_entry: Dec
  avg_exit: Dec
  gross_pnl: Dec
  fees_total: Dec
  net_pnl: Dec
  result: Result
  r_multiple: Dec | null
  execution_score: number | null
  score_band: Band | null
  tags: string[]
  has_screenshot: boolean
}

export type TradeList = { items: TradeListItem[]; total: number; page: number; page_size: number }

export type Fill = {
  id: number
  fill_type: 'entry' | 'exit'
  price: Dec
  quantity: Dec
  filled_at: string
  note: string | null
  realized_points: Dec | null
  realized_pnl: Dec | null
}

export type CriterionCheck = {
  criterion_id: number
  label: string
  weight: Dec
  checked: boolean
  note: string | null
}

export type TradeDetail = {
  id: number
  account_id: number
  instrument: { id: number; symbol: string; name: string | null; tick_size: Dec; tick_value: Dec }
  setup: SetupBrief | null
  direction: Direction
  session: string | null
  tags: string[]
  opened_at: string
  closed_at: string
  stop_price: Dec | null
  target_price: Dec | null
  quantity: Dec
  avg_entry: Dec
  avg_exit: Dec
  points: Dec
  risk_amount: Dec | null
  gross_pnl: Dec
  fees_total: Dec
  slippage_ticks: Dec
  slippage_cost: Dec
  net_pnl: Dec
  r_multiple: Dec | null
  execution_score: number | null
  score_band: Band | null
  pre_trade_focus: string | null
  environment: string | null
  debrief_notes: string | null
  screenshot_path: string | null
  screenshot_url: string | null
  fills: Fill[]
  fees: { name: string; amount: Dec }[]
  criteria: CriterionCheck[]
  xp_points: number | null
  prev_trade_id: number | null
  next_trade_id: number | null
  created_at: string
}

export type Summary = {
  trade_count: number
  wins: number
  losses: number
  breakevens: number
  net_pnl: Dec
  gross_pnl: Dec
  fees_total: Dec
  gross_profits: Dec
  gross_losses: Dec
  profit_factor: Dec | null
  win_rate: Dec | null
  expectancy: Dec | null
  total_r: Dec
  avg_execution_score: Dec | null
  return_pct: Dec | null
}

export type EquityPoint = {
  closed_at: string
  equity: Dec
  trade_id: number
  net_pnl: Dec
  result: Result
}

export type Equity = {
  baseline: Dec
  points: EquityPoint[]
  peak: Dec
  current: Dec
  drawdown_amount: Dec
  drawdown_pct: Dec
  max_drawdown_pct: Dec
}

export type DisciplineBucket = {
  band: Band
  trade_count: number
  win_rate: Dec | null
  net_pnl: Dec
  avg_r: Dec | null
}

export type SetupRow = {
  setup_id: number
  name: string | null
  trade_count: number
  win_rate: Dec | null
  net_pnl: Dec
  expectancy: Dec | null
  avg_execution_score: Dec | null
  rank: SetupRank
  low_sample: boolean
}

export type Xp = {
  total_xp: number
  level: number
  xp_in_level: number
  xp_per_level: number
  win_streak: number
}

export type Dashboard = {
  range: string
  account: string
  currency: string | null
  starting_balance: Dec
  summary: Summary
  equity: Equity
  discipline: { buckets: DisciplineBucket[]; saved_capital: Dec }
  setups: SetupRow[]
  recent_trades: TradeListItem[]
  xp: Xp
}
