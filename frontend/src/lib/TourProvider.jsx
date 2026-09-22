import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useSaveSettings, useSettings } from '../api/queries'
import { TOUR_STEPS } from './tourSteps'

const TourContext = createContext(null)

function goToStep(step, location, navigate) {
  if (step.path !== null && location.pathname !== step.path) navigate(step.path)
}

export function TourProvider({ children }) {
  const settings = useSettings()
  const save = useSaveSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [stepIndex, setStepIndex] = useState(null)
  const [showingWelcome, setShowingWelcome] = useState(false)
  const [autoArmed, setAutoArmed] = useState(false)

  // Arms itself once, the first time a fresh account reaches the Dashboard.
  // The welcome screen, not a highlight, is what a fresh account sees first.
  useEffect(() => {
    if (autoArmed || !settings.data) return
    setAutoArmed(true)
    if (!settings.data.has_seen_tour && location.pathname === '/') setShowingWelcome(true)
  }, [autoArmed, settings.data, location.pathname])

  const finish = () => {
    setStepIndex(null)
    setShowingWelcome(false)
    if (settings.data) save.mutate({ compliance_cutoff: settings.data.compliance_cutoff, has_seen_tour: true })
  }

  const start = () => setShowingWelcome(true)

  const begin = () => {
    setShowingWelcome(false)
    setStepIndex(0)
    goToStep(TOUR_STEPS[0], location, navigate)
  }

  const next = () => {
    const nextIndex = stepIndex + 1
    if (nextIndex >= TOUR_STEPS.length) {
      finish()
      return
    }
    setStepIndex(nextIndex)
    goToStep(TOUR_STEPS[nextIndex], location, navigate)
  }

  const step = stepIndex === null ? null : TOUR_STEPS[stepIndex]
  const value = {
    step,
    showingWelcome,
    stepNumber: stepIndex === null ? 0 : stepIndex + 1,
    stepCount: TOUR_STEPS.length,
    next,
    skip: finish,
    start,
    begin,
  }

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour() {
  const value = useContext(TourContext)
  if (!value) throw new Error('useTour must be used within a TourProvider')
  return value
}
