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

// ── Correlation heatmap ───────────────────────────────────────────────────────
// Diverging scale: positive r → accent (warm), negative r → CLUSTER_COLORS[1] (cool).
// Alpha is |r| so weak relationships fade towards the surface colour.
const POSITIVE_RGB = '201,100,66'
const NEGATIVE_RGB = '74,127,165'

export function correlationColor(r: number): string {
  const alpha = Math.min(1, Math.abs(r)).toFixed(2)
  return `rgba(${r < 0 ? NEGATIVE_RGB : POSITIVE_RGB},${alpha})`
}

// Confusion-matrix cell intensity: the share of a row's (actual class) samples
// that landed in this cell. 0 when the row is empty so we never divide by zero.
export function matrixCellAlpha(value: number, rowTotal: number): number {
  if (rowTotal <= 0 || value <= 0) return 0
  return Math.min(1, value / rowTotal)
}

export function formatCorrelation(r: number): string {
  return r.toFixed(2)
}

// ── Column profile ────────────────────────────────────────────────────────────
interface TopValueLike { value: string; count: number }
interface ProfileLike {
  mean?: number | null
  std?: number | null
  min?: number | null
  max?: number | null
  top_values?: TopValueLike[] | null
  min_date?: string | null
  max_date?: string | null
}

// One-line, type-appropriate description of a column for the upload preview table.
export function formatColumnDetail(columnType: string, profile: ProfileLike): string {
  if (columnType === 'numeric' || columnType === 'class_label') {
    if (profile.mean == null || profile.min == null || profile.max == null) return '—'
    const spread = profile.std == null ? '' : ` ± ${formatNumber(profile.std)}`
    return `${formatNumber(profile.mean)}${spread} · ${formatNumber(profile.min)}–${formatNumber(profile.max)}`
  }
  if (columnType === 'datetime') {
    if (!profile.min_date || !profile.max_date) return '—'
    return `${profile.min_date} → ${profile.max_date}`
  }
  if (!profile.top_values || profile.top_values.length === 0) return '—'
  return profile.top_values.map(t => `${t.value} (${t.count})`).join(', ')
}

export function formatMissing(pct: number): string {
  return pct === 0 ? '0%' : `${pct.toFixed(1)}%`
}
