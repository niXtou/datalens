import { useEffect, useState } from 'react'
import type { components } from '../types/api'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import { formatNumber, stripMarkdown } from '../lib/formatters'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts'

type ResultsResponse  = components['schemas']['ResultsResponse']
type ClusteringResult = components['schemas']['ClusteringResult']
type RegressionResult = components['schemas']['RegressionResult']
type AnomalyResult    = components['schemas']['AnomalyResult']

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
  const points = result.x_values.map((x, i) => ({
    x,
    y: result.y_values[i],
    cluster: result.cluster_labels[i],
  }))

  const uniqueClusters = Array.from(new Set(result.cluster_labels)).sort((a, b) => a - b)

  // Explicit domain with padding prevents Recharts from deriving bounds only
  // from the first Scatter series, which caused other clusters to plot at zero.
  const xMin = Math.min(...result.x_values)
  const xMax = Math.max(...result.x_values)
  const yMin = Math.min(...result.y_values)
  const yMax = Math.max(...result.y_values)
  const xPad = (xMax - xMin) * 0.08 || 1
  const yPad = (yMax - yMin) * 0.08 || 1

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Clusters found" value={String(result.n_clusters)} />
        <MetricCard label="Silhouette score" value={result.silhouette_score.toFixed(3)} />
      </div>

      <div className="flex gap-4 flex-wrap">
        {uniqueClusters.map((c, i) => (
          <div key={c} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)' }}>Cluster {c}</span>
          </div>
        ))}
      </div>

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
          Axes show the first two numeric features. Each colour is one group.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="x"
              type="number"
              name={result.feature_x}
              domain={[xMin - xPad, xMax + xPad]}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: result.feature_x, position: 'insideBottom', offset: -14, fill: 'var(--color-muted)', fontSize: 12 }}
              tick={axisTickStyle}
            />
            <YAxis
              dataKey="y"
              type="number"
              name={result.feature_y}
              domain={[yMin - yPad, yMax + yPad]}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: result.feature_y, angle: -90, position: 'insideLeft', fill: 'var(--color-muted)', fontSize: 12 }}
              tick={axisTickStyle}
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
  const coefData = result.coefficients.map((coef, i) => ({
    name: result.feature_names[i] ?? `f${i}`,
    coefficient: +coef.toFixed(4),
  }))

  const avpData = result.actuals.map((actual, i) => ({
    actual,
    predicted: result.predicted[i],
  }))

  const allVals = [...result.actuals, ...result.predicted]
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)

  return (
    <div className="flex flex-col gap-5">
      <MetricCard label="R² score" value={result.r2_score.toFixed(4)} />

      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px' }}>
          Actual vs. predicted — <em style={{ fontStyle: 'normal', color: 'var(--color-subtle)' }}>target: {result.target_name}</em>
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginBottom: '12px' }}>
          Points on the dashed line = perfect prediction. Tighter cluster = better model.
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="actual"
              type="number"
              name="Actual"
              domain={[minVal, maxVal]}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: 'Actual', position: 'insideBottom', offset: -12, fill: 'var(--color-muted)', fontSize: 12 }}
              tick={axisTickStyle}
            />
            <YAxis
              dataKey="predicted"
              type="number"
              name="Predicted"
              domain={[minVal, maxVal]}
              tickCount={5}
              tickFormatter={formatNumber}
              label={{ value: 'Predicted', angle: -90, position: 'insideLeft', fill: 'var(--color-muted)', fontSize: 12 }}
              tick={axisTickStyle}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(v, name) => [typeof v === 'number' ? formatNumber(v) : v, name]}
            />
            <ReferenceLine
              segment={[{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }]}
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
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
            Feature coefficients — how much each input shifts the prediction
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, coefData.length * 40)}>
            <BarChart data={coefData} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" horizontal={false} />
              <XAxis type="number" tick={axisTickStyle} />
              <YAxis type="category" dataKey="name" tick={axisTickStyle} width={80} />
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

function AnomalyPanel({ result }: { result: AnomalyResult }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Contamination rate" value={`${(result.contamination_rate * 100).toFixed(1)}%`} />
        <MetricCard label="Anomalies detected" value={String(result.anomaly_indices.length)} />
      </div>
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
          Row indices flagged as anomalies by IsolationForest
        </p>
        <div
          className="rounded-[var(--radius-md)] overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-background)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, fontSize: '0.78rem' }}>
                  Row index
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, fontSize: '0.78rem' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {result.anomaly_indices.slice(0, 20).map((idx, i) => (
                <tr
                  key={idx}
                  style={{
                    background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-background)',
                    borderTop: '1px solid var(--color-border-light)',
                  }}
                >
                  <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: 'var(--color-text)' }}>
                    {idx}
                  </td>
                  <td style={{ padding: '9px 16px' }}>
                    <Badge variant="default" style={{ fontSize: '0.72rem' }}>anomaly</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.anomaly_indices.length > 20 && (
            <div
              style={{
                padding: '10px 16px',
                background: 'var(--color-background)',
                borderTop: '1px solid var(--color-border-light)',
                fontSize: '0.8rem',
                color: 'var(--color-subtle)',
              }}
            >
              +{result.anomaly_indices.length - 20} more rows
            </div>
          )}
        </div>
      </div>
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

export default function ResultsDashboard({ fileId }: { fileId: string }) {
  const [data, setData]   = useState<ResultsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/results/${fileId}`)
      .then(r => { if (!r.ok) throw new Error(`Server error: ${r.status}`); return r.json() })
      .then(setData)
      .catch(err => setError(String(err)))
  }, [fileId])

  if (error) return <p style={{ color: '#c0392b', fontSize: '0.875rem' }}>{error}</p>
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

  const tabs = [
    clustering && { id: 'clustering', label: 'Clustering' },
    regression && { id: 'regression', label: 'Regression' },
    anomaly    && { id: 'anomaly',    label: 'Anomaly'    },
    data.summary && { id: 'summary', label: 'Summary'    },
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

      {anomaly && (
        <TabsContent value="anomaly">
          <Card>
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>Anomaly Detection</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>IsolationForest — rows that look unusual compared to the rest</p>
            </CardHeader>
            <CardContent><AnomalyPanel result={anomaly} /></CardContent>
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
