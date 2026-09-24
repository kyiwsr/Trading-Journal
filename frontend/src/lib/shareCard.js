import { drawChip } from './chip'
import { money, rMultiple } from './format'
import { BAND_LABEL } from './labels'

// Mirrors frontend/src/tokens.css; a canvas can't read CSS custom properties directly.
const TOKENS = {
  navy: '#004777',
  crimson: '#a30000',
  greenText: '#00783f',
  muted: '#4a6076',
  canvas: '#ffffff',
  tintSlate: '#f0f7fa',
  grid: '#d7e4ea',
}

const CARD_SIZE = 1080

// Every font+weight the card draws, loaded explicitly before drawing: canvas text can
// silently fall back to a system font if the browser hasn't fetched the real one yet.
const FONTS_USED = [
  '700 46px "Space Grotesk"',
  '700 30px "Space Grotesk"',
  '400 24px "Space Mono"',
  '700 108px "Space Mono"',
  '700 34px "Space Mono"',
  '500 30px "Hanken Grotesk"',
]

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function formatCardDate(iso) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

// The data a card needs, with no canvas involved, so this is the part worth unit testing.
export function shareCardModel(trade, currency) {
  const net = Number(trade.net_pnl)
  const mood = net > 0 ? 'win' : net < 0 ? 'loss' : 'neutral'
  const setupText = trade.setup ? trade.setup.name : 'No setup'
  const scorePart =
    trade.execution_score === null
      ? 'No setup scored'
      : `${BAND_LABEL[trade.score_band] ?? ''} (${trade.execution_score}%)`
  const rPart = trade.r_multiple === null ? 'No stop set' : rMultiple(trade.r_multiple)

  return {
    mood,
    symbol: trade.instrument.symbol,
    direction: trade.direction.toUpperCase(),
    dateText: formatCardDate(trade.closed_at),
    netPnlText: money(trade.net_pnl, { currency, signed: true }),
    statsText: `${rPart} · ${scorePart}`,
    footerText: trade.session ? `${setupText} · ${trade.session}` : setupText,
  }
}

export function drawShareCard(ctx, model) {
  const size = CARD_SIZE
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = TOKENS.tintSlate
  ctx.fillRect(0, 0, size, size)

  const pad = 64
  const cardX = pad
  const cardY = pad
  const cardW = size - pad * 2
  const cardH = size - pad * 2
  const shadowOffset = 18

  ctx.fillStyle = TOKENS.navy
  roundRect(ctx, cardX + shadowOffset, cardY + shadowOffset, cardW, cardH, 12)
  ctx.fill()
  ctx.fillStyle = TOKENS.canvas
  roundRect(ctx, cardX, cardY, cardW, cardH, 12)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = TOKENS.navy
  roundRect(ctx, cardX, cardY, cardW, cardH, 12)
  ctx.stroke()

  const innerPad = 88
  const left = cardX + innerPad
  const right = cardX + cardW - innerPad
  const midX = (left + right) / 2
  let cy = cardY + 226

  drawChip(ctx, left, cy - 8, 92, model.mood)
  ctx.textAlign = 'left'
  ctx.fillStyle = TOKENS.navy
  ctx.font = '700 46px "Space Grotesk"'
  ctx.fillText(`${model.symbol} ${model.direction}`, left + 112, cy + 56)

  ctx.textAlign = 'right'
  ctx.font = '700 30px "Space Grotesk"'
  ctx.fillText('APEXLOG', right, cy + 12)
  ctx.font = '400 24px "Space Mono"'
  ctx.fillStyle = TOKENS.muted
  ctx.fillText(model.dateText, right, cy + 48)

  cy += 130
  ctx.strokeStyle = TOKENS.grid
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(left, cy)
  ctx.lineTo(right, cy)
  ctx.stroke()

  cy += 130
  ctx.textAlign = 'center'
  ctx.font = '700 108px "Space Mono"'
  ctx.fillStyle = model.mood === 'win' ? TOKENS.greenText : model.mood === 'loss' ? TOKENS.crimson : TOKENS.navy
  ctx.fillText(model.netPnlText, midX, cy)

  cy += 76
  ctx.font = '700 34px "Space Mono"'
  ctx.fillStyle = TOKENS.navy
  ctx.fillText(model.statsText, midX, cy)

  cy += 90
  ctx.strokeStyle = TOKENS.grid
  ctx.beginPath()
  ctx.moveTo(left, cy)
  ctx.lineTo(right, cy)
  ctx.stroke()

  cy += 56
  ctx.textAlign = 'left'
  ctx.font = '500 30px "Hanken Grotesk"'
  ctx.fillStyle = TOKENS.muted
  ctx.fillText(model.footerText, left, cy)
}

async function loadFonts() {
  if (!document.fonts) return
  await Promise.all(FONTS_USED.map((font) => document.fonts.load(font)))
}

export async function renderShareCardCanvas(trade, currency) {
  await loadFonts()
  const canvas = document.createElement('canvas')
  canvas.width = CARD_SIZE
  canvas.height = CARD_SIZE
  drawShareCard(canvas.getContext('2d'), shareCardModel(trade, currency))
  return canvas
}

// Triggers a save-as for an already-rendered canvas, e.g. after the person has looked
// at a preview and confirmed it. Separate from rendering so a preview step can render
// once, show it, and only download from that same canvas on confirmation.
export async function downloadCanvas(canvas, filename) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not create the share image.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function downloadShareCard(trade, currency) {
  const canvas = await renderShareCardCanvas(trade, currency)
  await downloadCanvas(canvas, `apexlog-trade-${trade.id}.png`)
}
