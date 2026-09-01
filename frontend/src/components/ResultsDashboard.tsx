import React, { useEffect, useMemo, useState } from 'react'
import type { components } from '../types/api'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Card, CardContent, CardHeader } from './ui/card'
import {
  formatNumber, formatPercent, formatCorrelation, correlationColor, matrixCellAlpha,
  niceRange, stripMarkdown,
} from '../lib/formatters'
import { downloadAnomalyCsv } from '../lib/downloads'
import {
  SCATTER_CHART_HEIGHT, REGRESSION_SCATTER_HEIGHT,
  BAR_CHART_MIN_HEIGHT, BAR_CHART_ROW_HEIGHT,
  AXIS_CHAR_WIDTH_PX, AXIS_MIN_WIDTH,
  HEATMAP_CELL_MAX_PX, HEATMAP_CELL_MIN_PX, HEATMAP_LABEL_THRESHOLD, HEATMAP_GRID_BUDGET_PX,
  CONFUSION_CELL_PX,
} from '../lib/constants'
import { Download } from 'lucide-react'
import { Button } from './ui/button'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts'

type ResultsResponse  = components['schemas']['ResultsResponse']
type ClusteringResult = components['schemas']['ClusteringResult']
type RegressionResult = components['schemas']['RegressionResult']
type AnomalyResult    = components['schemas']['AnomalyResult']
type ClassificationResult = components['schemas']['ClassificationResult']
type CorrelationResult    = components['schemas']['CorrelationResult']

const CLUSTER_COLORS = ['#C96442', '#4A7FA5', '#6B8E5E', '#8B6E9A', '#C4943A', '#5E8A8A']


function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[var(--radius-md)] p-4"
      style={{ background: 'var(--color-background)', border: '1px solid var(--color-border-light)' }}
    >
      <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
        {value}
      </p>
    </div>
  )
}

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  fontSize: '13px',
}

const axisTickStyle = { fontSize: 12, fill: 'var(--color-subtle)' }

function ClusteringPanel({ result }: { result: ClusteringResult }) {
  const { points, xDomain, yDomain } = useMemo(() => {
    const pts = result.x_values.map((x, i) => ({
      x, y: result.y_values[i], cluster: result.cluster_labels[i],
    }))
    // niceRange rounds to clean tick intervals; PCA axes use raw bounds (ticks hidden).
    const xD = result.pca_projection
      ? [Math.min(...result.x_values) * 1.08, Math.max(...result.x_values) * 1.08] as [number, number]
      : niceRange(Math.min(...result.x_values), Math.max(...result.x_values))
    const yD = result.pca_projection
      ? [Math.min(...result.y_values) * 1.08, Math.max(...result.y_values) * 1.08] as [number, number]
      : niceRange(Math.min(...result.y_values), Math.max(...result.y_values))
    return { points: pts, xDomain: xD, yDomain: yD }
  }, [result])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Clusters found" value={String(result.n_clusters)} />
        <MetricCard label="Silhouette score" value={result.silhouette_score.toFixed(3)} />
      </div>

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
          {result.pca_projection
            ? 'Axes are a PCA projection of all numeric features (scaled). The chart reflects the true cluster geometry — each colour is one group.'
            : 'Each colour is one cluster. Axes show the two numeric features.'}
        </p>
        <ResponsiveContainer width="100%" height={SCATTER_CHART_HEIGHT}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 28, left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="x"
              type="number"
              name={result.feature_x}
              domain={xDomain}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: result.feature_x, position: 'insideBottom', offset: -14, style: { textAnchor: 'middle', fill: 'var(--color-muted)', fontSize: 12 } }}
              tick={result.pca_projection ? false : axisTickStyle}
            />
            <YAxis
              dataKey="y"
              type="number"
              name={result.feature_y}
              domain={yDomain}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: result.feature_y, angle: -90, position: 'insideLeft', offset: 10, style: { textAnchor: 'middle', fill: 'var(--color-muted)', fontSize: 12 } }}
              tick={result.pca_projection ? false : axisTickStyle}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(v, name) => [typeof v === 'number' ? formatNumber(v) : v, name]}
            />
            {/* Single Scatter + Cell avoids the multi-series domain calculation
                issue in Recharts where only the first series drives axis bounds. */}
            <Scatter data={points}>
              {points.map((p, i) => (
                <Cell key={i} fill={CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]} opacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RegressionPanel({ result }: { result: RegressionResult }) {
  const { coefData, avpData, domMin, domMax, labelWidth } = useMemo(() => {
    const coef = result.standardized_coefficients.map((c, i) => ({
      name: result.feature_names[i] ?? `f${i}`, coefficient: +c.toFixed(4),
    }))
    const avp = result.actuals.map((actual, i) => ({ actual, predicted: result.predicted[i] }))
    const [mn, mx] = niceRange(
      Math.min(...result.actuals, ...result.predicted),
      Math.max(...result.actuals, ...result.predicted),
    )
    const lw = coef.length > 0
      ? Math.max(AXIS_MIN_WIDTH, Math.max(...coef.map(d => d.name.length)) * AXIS_CHAR_WIDTH_PX)
      : AXIS_MIN_WIDTH
    return { coefData: coef, avpData: avp, domMin: mn, domMax: mx, labelWidth: lw }
  }, [result])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="R² (in-sample)" value={result.r2_score.toFixed(4)} />
        <MetricCard label="R² (5-fold CV)" value={result.cv_r2_score == null ? '—' : result.cv_r2_score.toFixed(4)} />
        <MetricCard label="RMSE" value={formatNumber(result.rmse)} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>
        The cross-validated R² is the honest number: the model is scored on rows it never saw during
        fitting, so it can't be flattered by memorising the data. RMSE is the typical prediction error
        in the units of <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-muted)' }}>{result.target_name}</span>
        {result.n_samples > 0 && <> across {result.n_samples.toLocaleString()} rows</>}.
      </p>

      {result.excluded_columns.length > 0 && (
        <p style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>
          Excluded as class labels: <strong style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{result.excluded_columns.join(', ')}</strong>
        </p>
      )}

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
          Actual vs. predicted — <em style={{ fontStyle: 'normal', color: 'var(--color-subtle)' }}>target: {result.target_name}</em>
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
          Points on the dashed line = perfect prediction. Tighter cluster = better model.
        </p>
        <ResponsiveContainer width="100%" height={REGRESSION_SCATTER_HEIGHT}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="actual"
              type="number"
              name="Actual"
              domain={[domMin, domMax]}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: 'Actual', position: 'insideBottom', offset: -12, style: { textAnchor: 'middle', fill: 'var(--color-muted)', fontSize: 12 } }}
              tick={axisTickStyle}
            />
            <YAxis
              dataKey="predicted"
              type="number"
              name="Predicted"
              domain={[domMin, domMax]}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: 'Predicted', angle: -90, position: 'insideLeft', offset: 10, style: { textAnchor: 'middle', fill: 'var(--color-muted)', fontSize: 12 } }}
              tick={axisTickStyle}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(v, name) => [typeof v === 'number' ? formatNumber(v) : v, name]}
            />
            <ReferenceLine
              segment={[{ x: domMin, y: domMin }, { x: domMax, y: domMax }]}
              stroke="var(--color-border)"
              strokeDasharray="5 5"
              strokeWidth={1.5}
            />
            <Scatter data={avpData} fill={CLUSTER_COLORS[0]} opacity={0.65} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {coefData.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
            Standardized feature importance
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
            Each bar = how many σ the prediction shifts when that feature increases by 1σ. Bars are comparable across features.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(BAR_CHART_MIN_HEIGHT, coefData.length * BAR_CHART_ROW_HEIGHT)}>
            <BarChart data={coefData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" horizontal={false} />
              <XAxis type="number" tick={axisTickStyle} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ ...axisTickStyle, fontFamily: 'monospace' }}
                width={labelWidth}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="coefficient" radius={[0, 4, 4, 0]}>
                {coefData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.coefficient >= 0 ? CLUSTER_COLORS[0] : CLUSTER_COLORS[1]}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function AnomalyPanel({ result, filename }: { result: AnomalyResult; filename: string }) {
  const cols     = result.anomaly_rows.length > 0 ? Object.keys(result.anomaly_rows[0]) : []
  const displayed = result.anomaly_rows
  const stats    = result.feature_stats

  function isExtreme(col: string, value: number): boolean {
    const s = stats[col]
    return !!s && s.std > 0 && Math.abs(value - s.mean) > 2 * s.std
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Anomalies detected" value={String(result.anomaly_indices.length)} />
        <MetricCard label="Contamination rate" value={`${(result.contamination_rate * 100).toFixed(1)}%`} />
      </div>

      {displayed.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => downloadAnomalyCsv(result, filename)}>
            <Download size={13} />
            Download CSV
          </Button>
        </div>
      )}

      {displayed.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>No anomalies detected.</p>
      ) : (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
            Actual values for flagged rows
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
            These rows were identified as outliers by IsolationForest. Look for values that seem extreme compared to the rest.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <div
              className="rounded-[var(--radius-md)] overflow-hidden"
              style={{ border: '1px solid var(--color-border)', minWidth: 'max-content' }}
            >
              <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--color-background)' }}>
                    <th style={{ padding: '9px 14px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border-light)' }}>
                      Row #
                    </th>
                    {cols.map(col => (
                      <th key={col} style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--color-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-background)',
                        borderTop: '1px solid var(--color-border-light)',
                      }}
                    >
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: 'var(--color-subtle)', borderRight: '1px solid var(--color-border-light)', whiteSpace: 'nowrap' }}>
                        {result.anomaly_indices[i]}
                      </td>
                      {cols.map(col => {
                        const extreme = isExtreme(col, row[col])
                        return (
                          <td
                            key={col}
                            style={{
                              padding: '8px 14px',
                              textAlign: 'right',
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap',
                              color:      extreme ? 'var(--color-accent)' : 'var(--color-text)',
                              background: extreme ? 'var(--color-accent-highlight)' : undefined,
                              fontWeight: extreme ? 600 : undefined,
                            }}
                          >
                            {formatNumber(row[col])}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.anomaly_indices.length > result.anomaly_rows.length && (
                <div
                  style={{
                    padding: '9px 14px',
                    background: 'var(--color-background)',
                    borderTop: '1px solid var(--color-border-light)',
                    fontSize: '0.78rem',
                    color: 'var(--color-subtle)',
                  }}
                >
                  Showing {result.anomaly_rows.length} of {result.anomaly_indices.length} flagged rows
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImportanceBarChart({ data }: { data: { name: string; value: number }[] }) {
  const labelWidth = data.length > 0
    ? Math.max(AXIS_MIN_WIDTH, Math.max(...data.map(d => d.name.length)) * AXIS_CHAR_WIDTH_PX)
    : AXIS_MIN_WIDTH
  return (
    <ResponsiveContainer width="100%" height={Math.max(BAR_CHART_MIN_HEIGHT, data.length * BAR_CHART_ROW_HEIGHT)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" horizontal={false} />
        <XAxis type="number" tick={axisTickStyle} domain={[0, 'auto']} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...axisTickStyle, fontFamily: 'monospace' }}
          width={labelWidth}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" name="Importance" radius={[0, 4, 4, 0]} fill={CLUSTER_COLORS[0]} opacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '0.72rem',
  color: 'var(--color-muted)',
}

function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const rowTotals = matrix.map(row => row.reduce((a, b) => a + b, 0))
  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `auto repeat(${labels.length}, ${CONFUSION_CELL_PX}px)`,
          gap: 3,
          alignItems: 'center',
          width: 'max-content',
        }}
      >
        {/* Header row: predicted labels */}
        <div style={{ ...monoLabel, color: 'var(--color-subtle)', paddingRight: 8, textAlign: 'right' }}>
          actual ↓ / predicted →
        </div>
        {labels.map(label => (
          <div key={`h-${label}`} style={{ ...monoLabel, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
            {label}
          </div>
        ))}

        {matrix.map((row, i) => (
          <React.Fragment key={`r-${labels[i]}`}>
            <div style={{ ...monoLabel, paddingRight: 8, textAlign: 'right', whiteSpace: 'nowrap' }} title={labels[i]}>
              {labels[i]}
            </div>
            {row.map((value, j) => {
              const alpha    = matrixCellAlpha(value, rowTotals[i])
              const diagonal = i === j
              return (
                <div
                  key={`c-${i}-${j}`}
                  title={`actual ${labels[i]} → predicted ${labels[j]}: ${value} (${formatPercent(alpha)} of row)`}
                  style={{
                    height: CONFUSION_CELL_PX - 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-sm)',
                    background: `rgba(201,100,66,${(alpha * 0.85).toFixed(2)})`,
                    border: diagonal ? '1px solid var(--color-accent-muted)' : '1px solid var(--color-border-light)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.8rem',
                    fontWeight: diagonal ? 600 : 400,
                    fontVariantNumeric: 'tabular-nums',
                    color: alpha > 0.55 ? '#fff' : 'var(--color-text)',
                  }}
                >
                  {value}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function ClassificationPanel({ result }: { result: ClassificationResult }) {
  const importance = useMemo(() =>
    result.feature_names
      .map((name, i) => ({ name, value: +(result.feature_importances[i] ?? 0).toFixed(4) }))
      .sort((a, b) => b.value - a.value),
  [result])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label={`CV accuracy (${result.cv_folds}-fold)`} value={formatPercent(result.cv_accuracy)} />
        <MetricCard label="Baseline (majority)" value={formatPercent(result.baseline_accuracy)} />
        <MetricCard label="Macro F1" value={result.macro_f1.toFixed(3)} />
        <MetricCard label="Classes" value={String(result.n_classes)} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>
        Cross-validation splits the {result.n_samples.toLocaleString()} rows into {result.cv_folds} parts and
        scores each part with a model trained on the others, so every row is predicted by a model that never
        saw it (± {formatPercent(result.cv_accuracy_std)} between parts). Baseline is what you'd score by always
        guessing the most common class — the model is only useful if it clearly beats that.
      </p>

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
          Confusion matrix — <em style={{ fontStyle: 'normal', color: 'var(--color-subtle)' }}>target: {result.target_name}</em>
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
          Rows are the true class, columns what the model predicted. A strong diagonal means few mix-ups.
        </p>
        <ConfusionMatrix labels={result.class_labels} matrix={result.confusion_matrix} />
      </div>

      {importance.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
            Feature importance
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
            How much each column helped the forest separate the classes. Importances sum to 1.
          </p>
          <ImportanceBarChart data={importance} />
        </div>
      )}
    </div>
  )
}

function CorrelationHeatmap({ result }: { result: CorrelationResult }) {
  const n         = result.columns.length
  const cellPx    = Math.max(HEATMAP_CELL_MIN_PX, Math.min(HEATMAP_CELL_MAX_PX, Math.floor(HEATMAP_GRID_BUDGET_PX / Math.max(n, 1))))
  const showText  = n <= HEATMAP_LABEL_THRESHOLD
  const labelSize = showText ? '0.7rem' : '0.62rem'

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `auto repeat(${n}, ${cellPx}px)`,
          gap: 2,
          width: 'max-content',
          paddingTop: 4,
        }}
      >
        <div />
        {result.columns.map(col => (
          <div
            key={`h-${col}`}
            title={col}
            style={{
              height: 84,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                ...monoLabel,
                fontSize: labelSize,
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                maxHeight: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {col}
            </span>
          </div>
        ))}

        {result.matrix.map((row, i) => (
          <React.Fragment key={`r-${result.columns[i]}`}>
            <div
              title={result.columns[i]}
              style={{
                ...monoLabel,
                fontSize: labelSize,
                paddingRight: 8,
                textAlign: 'right',
                whiteSpace: 'nowrap',
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                alignSelf: 'center',
              }}
            >
              {result.columns[i]}
            </div>
            {row.map((r, j) => (
              <div
                key={`c-${i}-${j}`}
                title={`${result.columns[i]} × ${result.columns[j]}: r = ${formatCorrelation(r)}`}
                style={{
                  height: cellPx,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  background: correlationColor(r),
                  border: '1px solid var(--color-border-light)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.66rem',
                  fontVariantNumeric: 'tabular-nums',
                  color: Math.abs(r) > 0.55 ? '#fff' : 'var(--color-muted)',
                }}
              >
                {showText ? formatCorrelation(r) : ''}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function CorrelationPanel({ result }: { result: CorrelationResult }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
          Pearson correlation — {result.columns.length} numeric columns
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
          Warm cells move together (r near +1), cool cells move in opposite directions (r near −1),
          faint cells are unrelated. Correlation is not causation.
          {result.columns.length > HEATMAP_LABEL_THRESHOLD && ' Hover a cell to read its value.'}
        </p>
        <CorrelationHeatmap result={result} />
        {result.truncated && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginTop: '10px' }}>
            Only the first 30 numeric columns are shown.
          </p>
        )}
      </div>

      {result.top_pairs.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '10px' }}>
            Strongest relationships
          </p>
          <div className="flex flex-col divide-y divide-[var(--color-border-light)]">
            {result.top_pairs.map(pair => (
              <div key={`${pair.feature_a}|${pair.feature_b}`} className="flex items-center gap-3 py-2">
                <span
                  aria-hidden
                  style={{
                    width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                    background: correlationColor(pair.r),
                    border: '1px solid var(--color-border-light)',
                  }}
                />
                <span style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pair.feature_a} <span style={{ color: 'var(--color-subtle)' }}>×</span> {pair.feature_b}
                </span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontVariantNumeric: 'tabular-nums',
                    color: pair.r < 0 ? CLUSTER_COLORS[1] : CLUSTER_COLORS[0],
                    flexShrink: 0,
                  }}
                >
                  {pair.r > 0 ? '+' : ''}{formatCorrelation(pair.r)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryPanel({ summary }: { summary: string }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] p-6"
      style={{
        background: 'var(--color-accent-soft)',
        border: '1px solid var(--color-accent-muted)',
      }}
    >
      <p style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 500, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Agent summary
      </p>
      <p style={{ fontSize: '0.95rem', color: 'var(--color-text)', lineHeight: '1.8' }}>
        {stripMarkdown(summary)}
      </p>
    </div>
  )
}

export default function ResultsDashboard({
  fileId,
  filename,
  onDataLoaded,
}: {
  fileId: string
  filename: string
  onDataLoaded?: (data: ResultsResponse) => void
}) {
  const [data, setData]   = useState<ResultsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    fetch(`${import.meta.env.VITE_API_URL}/results/${fileId}`)
      .then(r => { if (!r.ok) throw new Error(`Server error: ${r.status}`); return r.json() })
      .then((d: ResultsResponse) => { setData(d); onDataLoaded?.(d) })
      .catch(err => setError(String(err)))
  }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
  if (!data) return (
    <div className="flex items-center gap-2 py-8">
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" style={{ animation: 'pulse-dot 1s ease-in-out infinite' }} />
      <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>Loading results…</span>
    </div>
  )

  const resultEntries = Object.entries(data.results)
  const clustering = resultEntries.find(([, v]) => v.type === 'clustering')?.[1] as ClusteringResult | undefined
  const regression = resultEntries.find(([, v]) => v.type === 'regression')?.[1] as RegressionResult | undefined
  const anomaly    = resultEntries.find(([, v]) => v.type === 'anomaly')?.[1]    as AnomalyResult    | undefined
  const classification = resultEntries.find(([, v]) => v.type === 'classification')?.[1] as ClassificationResult | undefined
  const correlation    = resultEntries.find(([, v]) => v.type === 'correlation')?.[1]    as CorrelationResult    | undefined

  const tabs = [
    data.summary   && { id: 'summary',        label: 'Summary'        },
    clustering     && { id: 'clustering',     label: 'Clustering'     },
    regression     && { id: 'regression',     label: 'Regression'     },
    classification && { id: 'classification', label: 'Classification' },
    anomaly        && { id: 'anomaly',        label: 'Anomaly'        },
    correlation    && { id: 'correlation',    label: 'Correlation'    },
  ].filter(Boolean) as { id: string; label: string }[]

  if (tabs.length === 0) return <p style={{ color: 'var(--color-muted)' }}>No results available.</p>

  return (
    <Tabs defaultValue={tabs[0].id}>
      <TabsList>
        {tabs.map(tab => (
          <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
        ))}
      </TabsList>

      {clustering && (
        <TabsContent value="clustering">
          <Card>
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>K-Means Clustering</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Groups similar rows together based on numeric features</p>
            </CardHeader>
            <CardContent><ClusteringPanel result={clustering} /></CardContent>
          </Card>
        </TabsContent>
      )}

      {regression && (
        <TabsContent value="regression">
          <Card>
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>Linear Regression</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Predicts <em style={{ fontStyle: 'normal', color: 'var(--color-text)' }}>{regression.target_name}</em> from the other numeric columns</p>
            </CardHeader>
            <CardContent><RegressionPanel result={regression} /></CardContent>
          </Card>
        </TabsContent>
      )}

      {classification && (
        <TabsContent value="classification">
          <Card>
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>RandomForest Classification</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Predicts <em style={{ fontStyle: 'normal', color: 'var(--color-text)' }}>{classification.target_name}</em> from the numeric columns, scored out-of-sample</p>
            </CardHeader>
            <CardContent><ClassificationPanel result={classification} /></CardContent>
          </Card>
        </TabsContent>
      )}

      {anomaly && (
        <TabsContent value="anomaly">
          <Card>
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>Anomaly Detection</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>IsolationForest — rows that look unusual compared to the rest</p>
            </CardHeader>
            <CardContent><AnomalyPanel result={anomaly} filename={filename} /></CardContent>
          </Card>
        </TabsContent>
      )}

      {correlation && (
        <TabsContent value="correlation">
          <Card>
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>Correlation</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Which numeric columns rise and fall together</p>
            </CardHeader>
            <CardContent><CorrelationPanel result={correlation} /></CardContent>
          </Card>
        </TabsContent>
      )}

      {data.summary && (
        <TabsContent value="summary">
          <SummaryPanel summary={data.summary} />
        </TabsContent>
      )}
    </Tabs>
  )
}
