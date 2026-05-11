import { describe, it, expect } from 'vitest'
import { columnBadgeVariant, formatPercent, formatScore, niceRange, stripMarkdown } from './formatters'

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

describe('niceRange', () => {
  it('rounds MEDV-like range to clean tens', () => {
    const [lo, hi] = niceRange(5, 50)
    expect(lo).toBe(0)
    expect(hi).toBe(50)
  })
  it('rounds proline-like range to clean hundreds', () => {
    const [lo, hi] = niceRange(278, 1680)
    expect(lo % 500).toBe(0)
    expect(hi % 500).toBe(0)
  })
  it('handles equal min/max', () => {
    const [lo, hi] = niceRange(5, 5)
    expect(hi).toBeGreaterThan(lo)
  })
})

describe('stripMarkdown', () => {
  it('strips bold markers', () => {
    expect(stripMarkdown('**hello world**')).toBe('hello world')
  })
  it('strips italic markers', () => {
    expect(stripMarkdown('*hello world*')).toBe('hello world')
  })
  it('strips headings', () => {
    expect(stripMarkdown('## Summary')).toBe('Summary')
  })
  it('strips inline code', () => {
    expect(stripMarkdown('use `run_clustering`')).toBe('use')
  })
  it('leaves plain prose unchanged', () => {
    expect(stripMarkdown('The data has two groups.')).toBe('The data has two groups.')
  })
  it('handles mixed markdown', () => {
    expect(stripMarkdown('**Finding:** *two* clusters')).toBe('Finding: two clusters')
  })
  it('does not leave double spaces when stripping inline code mid-sentence', () => {
    expect(stripMarkdown('hello `code` world')).toBe('hello world')
  })
})
