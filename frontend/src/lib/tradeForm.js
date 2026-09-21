import Decimal from 'decimal.js'

import type { ApiError } from '../api/client'
import type { Direction, Setup, TradeDetail, TradePayload } from '../api/types'
import { newRowKey } from './rowKey'
import { parseDecimal } from './tradeMath'

export type FillRow = { key: string; price: string; quantity: string; time: string; note: string }
export type CheckState = { checked: boolean; note: string }

export type TradeFormState = {
  accountId: string
  instrumentId: string
  setupId: string
  direction: Direction
  session: string
  tags: string
  entries: FillRow[]
  exits: FillRow[]
  stop: string
  target: string
  slippageTicks: string
  checks: Record<number, CheckState>
  preTradeFocus: string
  environment: string
  debriefNotes: string
  screenshotPath: string | null
}

// Keys are `account`, `instrument`, `stop`, `entry.<row>.price`, `fills` (the group) and so on.
export type FormErrors = Record<string, string>

// Limits mirror backend/app/schemas/trade.py and base.py.
const MAX_DECIMALS = 8
const MAX_FILLS = 50
const MAX_TAGS = 20
const MAX_TAG_LENGTH = 40
const MAX_SESSION_LENGTH = 60
const MAX_NOTE_LENGTH = 300

export const blankRow = (): FillRow => ({ key: newRowKey(), price: '', quantity: '', time: '', note: '' })

export function emptyForm({ accountId = '' }: { accountId?: string } = {}): TradeFormState {
  return {
    accountId,
    instrumentId: '',
    setupId: '',
    direction: 'long',
    session: '',
    tags: '',
    entries: [blankRow()],
    exits: [blankRow()],
    stop: '',
    target: '',
    slippageTicks: '',
    checks: {},
    preTradeFocus: '',
    environment: '',
    debriefNotes: '',
    screenshotPath: null,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

// The datetime-local input works in the browser's zone, the same zone the ledger displays.
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(',')) {
    const tag = part.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

const isBlank = (text: string) => text.trim() === ''

function positiveError(text: string): string | undefined {
  if (isBlank(text)) return 'Enter a value.'
  const value = parseDecimal(text)
  if (value === null) return 'Enter a plain number, like 20380.25.'
  if (!value.greaterThan(0)) return 'Must be greater than 0.'
  if (value.decimalPlaces() > MAX_DECIMALS) return `Use at most ${MAX_DECIMALS} decimal places.`
  return undefined
}

function optionalPositiveError(text: string): string | undefined {
  return isBlank(text) ? undefined : positiveError(text)
}

function slippageError(text: string): string | undefined {
  if (isBlank(text)) return undefined
  const value = parseDecimal(text)
  if (value === null) return 'Enter a plain number of ticks.'
  if (value.isNegative()) return 'Must be 0 or more.'
  if (value.decimalPlaces() > MAX_DECIMALS) return `Use at most ${MAX_DECIMALS} decimal places.`
  return undefined
}

export function validateForm(form: TradeFormState): FormErrors {
  const errors: FormErrors = {}
  const set = (key: string, message: string | undefined) => {
    if (message) errors[key] = message
  }

  set('account', form.accountId ? undefined : 'Choose an account.')
  set('instrument', form.instrumentId ? undefined : 'Choose an instrument.')
  set('session', form.session.length > MAX_SESSION_LENGTH ? `Session can be at most ${MAX_SESSION_LENGTH} characters.` : undefined)
  set('stop', optionalPositiveError(form.stop))
  set('target', optionalPositiveError(form.target))
  set('slippage', slippageError(form.slippageTicks))

  const tags = parseTags(form.tags)
  if (tags.length > MAX_TAGS) set('tags', `Use at most ${MAX_TAGS} tags.`)
  else if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) set('tags', `Each tag can be at most ${MAX_TAG_LENGTH} characters.`)

  const rows = [
    ...form.entries.map((row, index) => ({ row, name: `entry.${index}` })),
    ...form.exits.map((row, index) => ({ row, name: `exit.${index}` })),
  ]
  if (rows.length > MAX_FILLS) set('fills', `A trade can have at most ${MAX_FILLS} fills.`)

  for (const { row, name } of rows) {
    set(`${name}.price`, positiveError(row.price))
    set(`${name}.quantity`, positiveError(row.quantity))
    set(`${name}.time`, fromLocalInput(row.time) ? undefined : 'Enter a date and time.')
    set(`${name}.note`, row.note.length > MAX_NOTE_LENGTH ? `Notes can be at most ${MAX_NOTE_LENGTH} characters.` : undefined)
  }

  // The group checks need clean rows, otherwise they would repeat the row messages.
  const rowsClean = rows.every(({ name }) => !errors[`${name}.quantity`] && !errors[`${name}.time`])
  if (rowsClean && !errors.fills) {
    const total = (list: FillRow[]) => list.reduce((sum, row) => sum.plus(parseDecimal(row.quantity) ?? 0), new Decimal(0))
    const bought = total(form.entries)
    const sold = total(form.exits)
    if (!bought.equals(sold)) {
      errors.fills = `Entry quantity (${bought}) and exit quantity (${sold}) must match.`
    } else {
      const earliest = (list: FillRow[]) => Math.min(...list.map((row) => new Date(row.time).getTime()))
      if (earliest(form.exits) < earliest(form.entries)) {
        errors.fills = 'An exit fill cannot come before the first entry fill.'
      }
    }
  }

  return errors
}

const textOrNull = (text: string) => text.trim() || null

function fillPayload(rows: FillRow[], type: 'entry' | 'exit'): TradePayload['fills'] {
  return rows.map((row) => ({
    fill_type: type,
    price: row.price.trim(),
    quantity: row.quantity.trim(),
    filled_at: fromLocalInput(row.time) ?? '',
    note: textOrNull(row.note),
  }))
}

export function buildPayload(form: TradeFormState, setup: Setup | null): TradePayload {
  return {
    account_id: Number(form.accountId),
    instrument_id: Number(form.instrumentId),
    setup_id: form.setupId ? Number(form.setupId) : null,
    direction: form.direction,
    session: textOrNull(form.session),
    tags: parseTags(form.tags),
    stop_price: textOrNull(form.stop),
    target_price: textOrNull(form.target),
    slippage_ticks: form.slippageTicks.trim() || '0',
    fills: [...fillPayload(form.entries, 'entry'), ...fillPayload(form.exits, 'exit')],
    criteria_checks: setup
      ? setup.criteria.map((criterion) => ({
          criterion_id: criterion.id,
          checked: form.checks[criterion.id]?.checked ?? false,
          note: textOrNull(form.checks[criterion.id]?.note ?? ''),
        }))
      : [],
    pre_trade_focus: textOrNull(form.preTradeFocus),
    environment: textOrNull(form.environment),
    debrief_notes: textOrNull(form.debriefNotes),
    screenshot_path: form.screenshotPath,
  }
}

// The API pads decimals to eight places, and writes a zero as "0E-8". The form shows what the trader would type.
export function trimZeros(text: string | null | undefined): string {
  if (!text) return ''
  let plain = text
  if (/e/i.test(text)) {
    try {
      plain = new Decimal(text).toFixed()
    } catch {
      return text
    }
  }
  return plain.includes('.') ? plain.replace(/0+$/, '').replace(/\.$/, '') : plain
}

const rowFromFill = (fill: TradeDetail['fills'][number]): FillRow => ({
  key: newRowKey(),
  price: trimZeros(fill.price),
  quantity: trimZeros(fill.quantity),
  time: toLocalInput(fill.filled_at),
  note: fill.note ?? '',
})

export function formFromTrade(trade: TradeDetail, setup: Setup | null): TradeFormState {
  const saved = new Map(trade.criteria.map((check) => [check.criterion_id, check]))
  const checks: Record<number, CheckState> = {}
  for (const criterion of setup?.criteria ?? []) {
    const check = saved.get(criterion.id)
    checks[criterion.id] = { checked: check?.checked ?? false, note: check?.note ?? '' }
  }
  const slippage = trimZeros(trade.slippage_ticks)
  return {
    accountId: String(trade.account_id),
    instrumentId: String(trade.instrument.id),
    setupId: trade.setup ? String(trade.setup.id) : '',
    direction: trade.direction,
    session: trade.session ?? '',
    tags: trade.tags.join(', '),
    entries: trade.fills.filter((fill) => fill.fill_type === 'entry').map(rowFromFill),
    exits: trade.fills.filter((fill) => fill.fill_type === 'exit').map(rowFromFill),
    stop: trimZeros(trade.stop_price),
    target: trimZeros(trade.target_price),
    slippageTicks: slippage === '0' ? '' : slippage,
    checks,
    preTradeFocus: trade.pre_trade_focus ?? '',
    environment: trade.environment ?? '',
    debriefNotes: trade.debrief_notes ?? '',
    screenshotPath: trade.screenshot_path,
  }
}

const FIELD_KEYS: Record<string, string> = {
  account_id: 'account',
  instrument_id: 'instrument',
  setup_id: 'setup',
  session: 'session',
  tags: 'tags',
  stop_price: 'stop',
  target_price: 'target',
  slippage_ticks: 'slippage',
}
const FILL_KEYS: Record<string, string> = { price: 'price', quantity: 'quantity', filled_at: 'time', note: 'note' }

// Turns the API's 422 details into per-field messages; anything that does not map to a field goes in `form`.
export function issuesToErrors(error: ApiError, entryCount: number): { fields: FormErrors; form: string[] } {
  const fields: FormErrors = {}
  const form: string[] = []
  if (error.issues.length === 0) return { fields, form: [error.message] }

  for (const issue of error.issues) {
    const path = issue.loc[0] === 'body' ? issue.loc.slice(1) : issue.loc
    let key: string | undefined
    if (path[0] === 'fills' && typeof path[1] === 'number' && typeof path[2] === 'string' && FILL_KEYS[path[2]]) {
      const index = path[1]
      key = index < entryCount ? `entry.${index}.${FILL_KEYS[path[2]]}` : `exit.${index - entryCount}.${FILL_KEYS[path[2]]}`
    } else if (typeof path[0] === 'string') {
      key = FIELD_KEYS[path[0]]
    }
    if (key) fields[key] ??= issue.msg
    else form.push(issue.msg)
  }
  return { fields, form }
}
