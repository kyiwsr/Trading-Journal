import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button, Checkbox, XpBar } from '.'

test('checkbox toggles', async () => {
  render(<Checkbox label="Rule" />)
  const box = screen.getByRole('checkbox', { name: 'Rule' })
  expect(box).not.toBeChecked()
  await userEvent.click(box)
  expect(box).toBeChecked()
})

test('xp bar clamps to 0-100%', () => {
  const { rerender } = render(<XpBar value={150} max={100} />)
  expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '100%' })
  rerender(<XpBar value={-5} max={100} />)
  expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '0%' })
})

test('button applies variant class and defaults to type=button', () => {
  render(<Button variant="primary">Go</Button>)
  const btn = screen.getByRole('button', { name: 'Go' })
  expect(btn).toHaveClass('btn-primary')
  expect(btn).toHaveAttribute('type', 'button')
})
