export function columnBadgeVariant(type: string): 'numeric' | 'categorical' | 'datetime' | 'muted' {
  if (type === 'numeric')     return 'numeric'
  if (type === 'categorical') return 'categorical'
  if (type === 'datetime')    return 'datetime'
  return 'muted'
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatScore(value: number): string {
  return value.toFixed(4)
}

// Drop trailing zeros after rounding to 2 decimal places (used for axis ticks and tooltips).
export function formatNumber(v: number): string {
  return parseFloat(v.toFixed(2)).toString()
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*(.*?)\*/gs, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/gs, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
