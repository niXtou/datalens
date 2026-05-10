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
