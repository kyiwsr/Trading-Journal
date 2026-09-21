import { useState } from 'react'

import { ApiError } from '../../api/client'

// Shared submit flow for the small settings forms: validate, save, then report API errors in one summary.
export function useEntityForm(
  initial,
  validate,
  save,
  onDone,
) {
  const [form, setForm] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const [apiProblem, setApiProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)

  const errors = attempted ? validate(form) : {}
  const problems = [...Object.values(errors), ...(apiProblem ? [apiProblem] : [])]

  const patch = (change) => setForm((current) => ({ ...current, ...change }))

  const submit = async (event) => {
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
