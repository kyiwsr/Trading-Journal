import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useTour } from '../lib/TourProvider'
import { Button } from './Button'

const MARGIN = 12
// A step's page may still be fetching its own data over the real network when
// the step starts (e.g. Replay navigating fresh into the Dashboard), so this
// watches the DOM for the target instead of guessing how long that takes.
// The timeout is only a safety net against a target that never appears.
const GIVE_UP_MS = 10_000

function useTargetRect(target) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!target) {
      setRect(null)
      return undefined
    }

    const measure = () => {
      const el = document.querySelector(`[data-tour="${target}"]`)
      if (el) setRect(el.getBoundingClientRect())
      return el
    }

    if (measure()) return undefined

    const observer = new MutationObserver(() => {
      if (measure()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const giveUp = setTimeout(() => observer.disconnect(), GIVE_UP_MS)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      clearTimeout(giveUp)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
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
