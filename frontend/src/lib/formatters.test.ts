import { describe, it, expect } from 'vitest'
import {
  columnBadgeVariant, formatPercent, formatScore, niceRange, stripMarkdown,
  correlationColor, matrixCellAlpha, formatCorrelation, formatColumnDetail, formatMissing,
} from './formatters'

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

describe('correlationColor', () => {
  it('uses the accent for positive r with alpha = |r|', () => {
    expect(correlationColor(0.5)).toBe('rgba(201,100,66,0.50)')
  })
  it('uses the cool cluster colour for negative r', () => {
    expect(correlationColor(-0.25)).toBe('rgba(74,127,165,0.25)')
  })
  it('clamps alpha to 1', () => {
    expect(correlationColor(1.7)).toBe('rgba(201,100,66,1.00)')
  })
  it('is transparent at r = 0', () => {
    expect(correlationColor(0)).toBe('rgba(201,100,66,0.00)')
  })
})

describe('matrixCellAlpha', () => {
  it('is the share of the row total', () => {
    expect(matrixCellAlpha(3, 12)).toBeCloseTo(0.25)
  })
  it('is 0 for an empty row', () => {
    expect(matrixCellAlpha(0, 0)).toBe(0)
  })
  it('is 0 for an empty cell', () => {
    expect(matrixCellAlpha(0, 5)).toBe(0)
  })
  it('never exceeds 1', () => {
    expect(matrixCellAlpha(9, 3)).toBe(1)
  })
})

describe('formatCorrelation', () => {
  it('shows two decimals', () => {
    expect(formatCorrelation(-0.8471)).toBe('-0.85')
    expect(formatCorrelation(1)).toBe('1.00')
  })
})

describe('formatColumnDetail', () => {
  it('formats numeric columns as mean ± std · min–max', () => {
    expect(formatColumnDetail('numeric', { mean: 30, std: 5, min: 25, max: 35 })).toBe('30 ± 5 · 25–35')
  })
  it('formats class_label columns like numeric ones', () => {
    expect(formatColumnDetail('class_label', { mean: 1, std: 0.82, min: 0, max: 2 })).toBe('1 ± 0.82 · 0–2')
  })
  it('omits std when missing', () => {
    expect(formatColumnDetail('numeric', { mean: 1.5, std: null, min: 1, max: 2 })).toBe('1.5 · 1–2')
  })
  it('formats categorical columns as top values with counts', () => {
    expect(formatColumnDetail('categorical', {
      top_values: [{ value: 'a', count: 12 }, { value: 'b', count: 7 }],
    })).toBe('a (12), b (7)')
  })
  it('formats datetime columns as a range', () => {
    expect(formatColumnDetail('datetime', { min_date: '2024-01-15', max_date: '2024-03-22' })).toBe('2024-01-15 → 2024-03-22')
  })
  it('returns a dash when the profile is empty', () => {
    expect(formatColumnDetail('numeric', {})).toBe('—')
    expect(formatColumnDetail('categorical', { top_values: [] })).toBe('—')
    expect(formatColumnDetail('datetime', {})).toBe('—')
  })
})

describe('formatMissing', () => {
  it('shows a bare 0% when nothing is missing', () => {
    expect(formatMissing(0)).toBe('0%')
  })
  it('keeps one decimal otherwise', () => {
    expect(formatMissing(12.5)).toBe('12.5%')
  })
})
