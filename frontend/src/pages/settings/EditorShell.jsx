import { useEffect, useRef } from 'react'

import { Button, Panel } from '../../components'

// Frame for an inline add or edit form: a problem summary that takes focus after a failed save, and the two actions.
export function EditorShell({ title, problems, focusToken, saving, onSubmit, onCancel, children }) {
  const summary = useRef(null)

  useEffect(() => {
    if (focusToken > 0) summary.current?.focus()
  }, [focusToken])

  return (
    <Panel title={title} tone="tint">
      <form onSubmit={onSubmit} noValidate className="entity-form">
        {problems.length > 0 ? (
          <div ref={summary} tabIndex={-1} role="alert" className="form-error tf-summary">
            <p className="tf-summary-title">
              {problems.length === 1 ? 'One problem to fix before saving' : `${problems.length} problems to fix before saving`}
            </p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {children}
        <div className="tf-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving' : 'Save'}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Panel>
  )
}
