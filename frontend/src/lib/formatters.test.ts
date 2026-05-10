import { describe, it, expect } from 'vitest'
import { columnBadgeVariant, formatPercent, formatScore } from './formatters'

describe('columnBadgeVariant', () => {
  it('returns numeric for numeric columns', () => {
    expect(columnBadgeVariant('numeric')).toBe('numeric')
  })
  it('returns categorical for categorical columns', () => {
    expect(columnBadgeVariant('categorical')).toBe('categorical')
  })
  it('returns datetime for datetime columns', () => {
    expect(columnBadgeVariant('datetime')).toBe('datetime')
  })
  it('returns muted for unknown types', () => {
    expect(columnBadgeVariant('unknown')).toBe('muted')
    expect(columnBadgeVariant('')).toBe('muted')
  })
})

describe('formatPercent', () => {
  it('formats 0.1 as 10.0%', () => {
    expect(formatPercent(0.1)).toBe('10.0%')
  })
  it('formats 0.0 as 0.0%', () => {
    expect(formatPercent(0.0)).toBe('0.0%')
  })
  it('formats 1.0 as 100.0%', () => {
    expect(formatPercent(1.0)).toBe('100.0%')
  })
  it('rounds to one decimal place', () => {
    expect(formatPercent(0.1234)).toBe('12.3%')
  })
})

describe('formatScore', () => {
  it('formats to 4 decimal places', () => {
    expect(formatScore(0.9)).toBe('0.9000')
  })
  it('rounds correctly', () => {
    expect(formatScore(0.98765)).toBe('0.9877')
  })
  it('handles perfect score', () => {
    expect(formatScore(1.0)).toBe('1.0000')
  })
})
