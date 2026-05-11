import type { components } from '../types/api'

type ResultsResponse = components['schemas']['ResultsResponse']
type AnomalyResult   = components['schemas']['AnomalyResult']

function stem(filename: string) {
  return filename.replace(/\.csv$/i, '')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(data: ResultsResponse, filename: string) {
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `${stem(filename)}_analysis.json`,
  )
}

export function downloadAnomalyCsv(result: AnomalyResult, filename: string) {
  if (result.anomaly_rows.length === 0) return
  const cols   = Object.keys(result.anomaly_rows[0])
  const header = ['row_index', ...cols].join(',')
  const rows   = result.anomaly_rows.map((row, i) =>
    [result.anomaly_indices[i], ...cols.map(c => row[c])].join(',')
  )
  triggerDownload(
    new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }),
    `${stem(filename)}_anomalies.csv`,
  )
}
