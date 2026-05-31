import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the label and emoji for a known status', () => {
    render(<StatusBadge status="ready" />)
    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.getByText('✌️')).toBeInTheDocument()
  })

  it('maps processing to its friendly label', () => {
    render(<StatusBadge status="processing" />)
    expect(screen.getByText('cooking')).toBeInTheDocument()
  })

  it('falls back to the raw status and a cloud emoji when unknown', () => {
    render(<StatusBadge status="weird-status" />)
    expect(screen.getByText('weird-status')).toBeInTheDocument()
    expect(screen.getByText('☁️')).toBeInTheDocument()
  })
})
