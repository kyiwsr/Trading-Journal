import { useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import type { FormErrors } from '../../lib/tradeForm'

// Shared submit flow for the small settings forms: validate, save, then report API errors in one summary.
export function useEntityForm<T>(
  initial: T,
  validate: (form: T) => FormErrors,
  save: (form: T) => Promise<unknown>,
  onDone: () => void,
) {
  const [form, setForm] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const [apiProblem, setApiProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)

  const errors: FormErrors = attempted ? validate(form) : {}
  const problems = [...Object.values(errors), ...(apiProblem ? [apiProblem] : [])]

  const patch = (change: Partial<T>) => setForm((current) => ({ ...current, ...change }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setApiProblem(null)
    if (Object.keys(validate(form)).length > 0) {
      setSubmitCount((count) => count + 1)
      return
    }
    setSaving(true)
    try {
      await save(form)
      onDone()
    } catch (error) {
      setApiProblem(error instanceof ApiError ? error.message : 'Could not save. Try again.')
      setSubmitCount((count) => count + 1)
    } finally {
      setSaving(false)
    }
  }

  return { form, setForm, patch, errors, problems, saving, submit, submitCount }
}
