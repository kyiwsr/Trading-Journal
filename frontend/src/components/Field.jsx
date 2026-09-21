import { useId } from 'react'

// Wires one label, hint and error message to the control it renders, so every input has an accessible name and description.
export function Field({ label, hint, error, className = '', children }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field ${className}`.trim()}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Select({ className = '', ...rest }) {
  return <select className={`input select-input ${className}`.trim()} {...rest} />
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`input textarea ${className}`.trim()} {...rest} />
}
