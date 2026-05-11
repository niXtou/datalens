export function columnBadgeVariant(type: string): 'numeric' | 'categorical' | 'datetime' | 'class_label' | 'muted' {
  if (type === 'numeric')     return 'numeric'
  if (type === 'categorical') return 'categorical'
  if (type === 'datetime')    return 'datetime'
  if (type === 'class_label') return 'class_label'
  return 'muted'
}

export function columnBadgeLabel(type: string): string {
  return type === 'class_label' ? 'class label' : type
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatScore(value: number): string {
  return value.toFixed(4)
}

// Compute a domain [lo, hi] whose step size is a clean power-of-10 multiple so
// Recharts tick labels land on round numbers instead of arbitrary decimals.
export function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1]
  const rawStep = (max - min) / 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const niceStep = [1, 2, 2.5, 5, 10].map(s => s * magnitude).find(s => s >= rawStep) ?? magnitude * 10
  return [Math.floor(min / niceStep) * niceStep, Math.ceil(max / niceStep) * niceStep]
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
