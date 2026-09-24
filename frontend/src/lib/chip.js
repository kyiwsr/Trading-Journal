// Chip, the app's mascot: a flat "arcade token" face, drawn as canvas paths rather than
// an image asset, since its only consumer (the share card) is itself drawn on a <canvas>.
const NAVY = '#004777'
const ORANGE = '#ff7700'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Each face is drawn in a 200x200 local box, scaled by drawChip to the requested size.
const FACES = {
  neutral(ctx) {
    ctx.beginPath(); ctx.ellipse(80, 98, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(120, 98, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(83, 94, 2.2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(123, 94, 2.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = NAVY
    ctx.beginPath(); ctx.moveTo(78, 122); ctx.quadraticCurveTo(100, 138, 122, 122); ctx.stroke()
  },
  win(ctx) {
    ctx.beginPath(); ctx.moveTo(73, 96); ctx.quadraticCurveTo(80, 88, 87, 96); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(113, 96); ctx.quadraticCurveTo(120, 88, 127, 96); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(76, 118); ctx.quadraticCurveTo(100, 140, 124, 118); ctx.stroke()
  },
  loss(ctx) {
    ctx.beginPath(); ctx.moveTo(73, 97); ctx.lineTo(87, 97); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(113, 97); ctx.lineTo(127, 97); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(78, 128); ctx.quadraticCurveTo(100, 116, 122, 128); ctx.stroke()
  },
}

export const CHIP_MOODS = Object.keys(FACES)

// Draws Chip as a size x size square, (x, y) its top-left corner (the coin body, not the shadow).
export function drawChip(ctx, x, y, size, mood = 'neutral') {
  const face = FACES[mood] ?? FACES.neutral
  const scale = size / 200
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)

  ctx.fillStyle = NAVY
  roundRect(ctx, 46, 46, 120, 120, 18); ctx.fill() // hard offset shadow

  ctx.fillStyle = ORANGE
  roundRect(ctx, 40, 40, 120, 120, 18); ctx.fill()
  ctx.lineWidth = 7
  ctx.strokeStyle = NAVY
  roundRect(ctx, 40, 40, 120, 120, 18); ctx.stroke()

  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.setLineDash([5, 6])
  ctx.lineWidth = 2.5
  roundRect(ctx, 54, 54, 92, 92, 12); ctx.stroke() // milled edge, a coin signifier
  ctx.restore()

  ctx.fillStyle = NAVY
  ctx.strokeStyle = NAVY
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.setLineDash([])
  face(ctx)

  ctx.restore()
}
