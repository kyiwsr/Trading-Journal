type Numeric = string | number | null | undefined

export const NA = 'n/a'

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function grouped(n: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

// Rounding to zero must not keep a minus sign.
function roundedSign(n: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(Math.abs(n) * factor) === 0 ? 0 : Math.sign(n)
}

export function signOf(value: Numeric): 'pos' | 'neg' | 'zero' {
  const n = toNumber(value)
  if (n === null || n === 0) return 'zero'
  return n > 0 ? 'pos' : 'neg'
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', MYR: 'RM' }

export function currencySymbol(code: string | null | undefined): string {
  if (!code) return '$'
  return SYMBOLS[code] ?? `${code} `
}

export function money(value: Numeric, options: { currency?: string | null; signed?: boolean } = {}): string {
  const n = toNumber(value)
  if (n === null) return NA
  const sign = roundedSign(n, 2)
  const prefix = sign < 0 ? '-' : sign > 0 && options.signed ? '+' : ''
  return `${prefix}${currencySymbol(options.currency)}${grouped(Math.abs(n), 2)}`
}

export function compactMoney(value: Numeric, currency?: string | null): string {
  const n = toNumber(value)
  if (n === null) return NA
  const text = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(n))
  return `${n < 0 ? '-' : ''}${currencySymbol(currency)}${text}`
}

export function price(value: Numeric, decimals = 2): string {
  const n = toNumber(value)
  return n === null ? NA : grouped(n, decimals)
}

export function priceDecimals(tickSize: Numeric): number {
  const text = String(tickSize ?? '')
  const fraction = text.includes('.') ? text.split('.')[1].replace(/0+$/, '') : ''
  return Math.max(2, fraction.length)
}

export function points(value: Numeric): string {
  const n = toNumber(value)
  if (n === null) return NA
  const sign = roundedSign(n, 2)
  return `${sign > 0 ? '+' : sign < 0 ? '-' : ''}${grouped(Math.abs(n), 2)}`
}

export function rMultiple(value: Numeric): string {
  const n = toNumber(value)
  if (n === null) return NA
  const sign = roundedSign(n, 2)
  return `${sign > 0 ? '+' : sign < 0 ? '-' : ''}${grouped(Math.abs(n), 2)}R`
}

// Rates from the API are already in percent units (63.6 means 63.6%).
export function percent(value: Numeric, decimals = 1, signed = false): string {
  const n = toNumber(value)
  if (n === null) return NA
  const sign = roundedSign(n, decimals)
  const prefix = sign < 0 ? '-' : sign > 0 && signed ? '+' : ''
  return `${prefix}${grouped(Math.abs(n), decimals)}%`
}

export function number(value: Numeric): string {
  const n = toNumber(value)
  return n === null ? NA : grouped(n, 0)
}

export function ratio(value: Numeric): string {
  const n = toNumber(value)
  return n === null ? NA : grouped(n, 2)
}

export function quantity(value: Numeric): string {
  const n = toNumber(value)
  return n === null ? NA : String(n)
}

const WEEKDAY_MONTH_DAY: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat('en-US', { ...WEEKDAY_MONTH_DAY, timeZone }).formatToParts(date)
  return `${part(day, 'weekday')} ${part(day, 'month')} ${part(day, 'day')} ${formatTime(iso, timeZone).slice(0, 5)}`
}

export function formatTime(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(iso))
  return `${part(parts, 'hour')}:${part(parts, 'minute')}:${part(parts, 'second')}`
}

export function formatDuration(fromIso: string, toIso: string): string {
  return formatSeconds((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000)
}

export function formatSeconds(elapsed: number): string {
  const total = Math.max(0, Math.round(elapsed))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}
