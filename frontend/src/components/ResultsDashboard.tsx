import { useEffect, useState } from 'react'
import type { components } from '../types/api'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'

type ResultsResponse  = components['schemas']['ResultsResponse']
type ClusteringResult = components['schemas']['ClusteringResult']
type RegressionResult = components['schemas']['RegressionResult']
type AnomalyResult    = components['schemas']['AnomalyResult']

const WARM_COLORS = ['#C96442', '#D4845F', '#8B6E5A', '#A0522D', '#CD853F', '#DEB887']

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

function ClusteringPanel({ result }: { result: ClusteringResult }) {
  const data = result.cluster_labels.map((label, i) => ({ i, label }))
  return (
    <div className="flex flex-col gap-5">
      <MetricCard label="Silhouette score" value={result.silhouette_score.toFixed(3)} />
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
          Data points coloured by cluster assignment
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="i" name="Index" tick={{ fontSize: 12, fill: 'var(--color-subtle)' }} />
            <YAxis dataKey="label" name="Cluster" tick={{ fontSize: 12, fill: 'var(--color-subtle)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            {[0, 1, 2].map(cluster => (
              <Scatter
                key={cluster}
                name={`Cluster ${cluster}`}
                data={data.filter(d => d.label === cluster)}
                fill={WARM_COLORS[cluster]}
                opacity={0.8}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RegressionPanel({ result }: { result: RegressionResult }) {
  const data = result.coefficients.map((coef, i) => ({ feature: `f${i}`, coefficient: +coef.toFixed(4) }))
  return (
    <div className="flex flex-col gap-5">
      <MetricCard label="R² score" value={result.r2_score.toFixed(4)} />
      <div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
          Feature coefficients from linear regression
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="feature" tick={{ fontSize: 12, fill: 'var(--color-subtle)' }} />
            <YAxis tick={{ fontSize: 12, fill: 'var(--color-subtle)' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line
              type="monotone"
              dataKey="coefficient"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-accent)', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
      <p style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 500, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Agent summary
      </p>
      <p style={{ fontSize: '0.95rem', color: 'var(--color-text)', lineHeight: '1.7', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
        {summary}
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
  if (!data)  return (
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
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>3 clusters · silhouette score</p>
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
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Last numeric column as target</p>
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
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>IsolationForest · flagged rows</p>
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
