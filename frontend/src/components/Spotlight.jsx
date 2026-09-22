import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useTour } from '../lib/TourProvider'
import { Button } from './Button'

const MARGIN = 12
const MAX_FIND_ATTEMPTS = 20

// Polls for the target rather than using a MutationObserver: the tour has at
// most a handful of steps, and a short poll is simpler to reason about than
// watching the whole DOM for an element that is usually already there.
function useTargetRect(target) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!target) {
      setRect(null)
      return
    }
    let attempts = 0
    let raf = null
    let poll = null

    const measure = () => {
      const el = document.querySelector(`[data-tour="${target}"]`)
      if (el) setRect(el.getBoundingClientRect())
      return el
    }

    const tick = () => {
      if (measure() || ++attempts >= MAX_FIND_ATTEMPTS) return
      poll = setTimeout(tick, 100)
    }
    tick()

    const onViewportChange = () => {
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      clearTimeout(poll)
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [target])

  return rect
}

function tooltipPosition(rect) {
  const spaceBelow = window.innerHeight - rect.bottom
  const below = spaceBelow > 180 || spaceBelow > rect.top
  const top = below ? rect.bottom + MARGIN : undefined
  const bottom = below ? undefined : window.innerHeight - rect.top + MARGIN
  const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - 320 - MARGIN)
  return { top, bottom, left: Math.max(left, MARGIN) }
}

export function Spotlight() {
  const { step, stepNumber, stepCount, next, skip } = useTour()
  const location = useLocation()
  const onThisPage = step && (step.path === null || location.pathname === step.path)
  const rect = useTargetRect(onThisPage ? step.target : null)

  useEffect(() => {
    if (!step) return
    const onKeyDown = (event) => event.key === 'Escape' && skip()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [step, skip])

  if (!step || !onThisPage || !rect) return null

  return (
    <div className="spotlight" role="dialog" aria-label={step.title}>
      <div
        className="spotlight-ring"
        style={{
          top: rect.top - MARGIN / 2,
          left: rect.left - MARGIN / 2,
          width: rect.width + MARGIN,
          height: rect.height + MARGIN,
        }}
      />
      <div className="spotlight-card" style={tooltipPosition(rect)}>
        <p className="spotlight-step">
          Step {stepNumber} of {stepCount}
        </p>
        <h2 className="spotlight-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="spotlight-actions">
          <Button onClick={skip}>Skip tour</Button>
          <Button variant="primary" onClick={next}>
            {stepNumber === stepCount ? 'Done' : 'Next step'}
          </Button>
        </div>
      </div>
    </div>
  )
}
