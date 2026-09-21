import { useEffect, useState, type ChangeEvent } from 'react'

import { ApiError } from '../../api/client'
import { screenshotProblem, SCREENSHOT_TYPES, uploadScreenshot } from '../../api/upload'
import { Button, Field } from '../../components'

type Props = {
  path: string | null
  savedPath: string | null
  savedUrl: string | null
  onChange: (path: string | null) => void
}

export function ScreenshotField({ path, savedPath, savedUrl, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    const problem = screenshotProblem(file)
    if (problem) {
      setError(problem)
      input.value = ''
      return
    }
    setError(null)
    setUploading(true)
    try {
      onChange(await uploadScreenshot(file))
      setPreview(URL.createObjectURL(file))
    } catch (failure) {
      const detail = failure instanceof ApiError ? failure.message : 'The upload failed.'
      setError(`${detail} You can still save the trade without a screenshot.`)
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  const shown = preview ?? (path !== null && path === savedPath ? savedUrl : null)

  return (
    <Field
      label="Screenshot"
      hint="One chart image, PNG, JPEG or WebP, up to 5 MB."
      error={error ?? undefined}
      className="screenshot-field"
    >
      {(control) => (
        <>
          <input
            {...control}
            className="input file-input"
            type="file"
            accept={SCREENSHOT_TYPES.join(',')}
            disabled={uploading}
            onChange={choose}
          />
          {uploading ? (
            <p className="muted" role="status">
              Uploading the screenshot
            </p>
          ) : null}
          {path ? (
            <div className="screenshot-current">
              {shown ? <img className="screenshot" src={shown} alt="The screenshot attached to this trade" /> : <p className="muted">A screenshot is attached.</p>}
              <Button
                onClick={() => {
                  setPreview(null)
                  onChange(null)
                }}
              >
                Remove screenshot
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Field>
  )
}
