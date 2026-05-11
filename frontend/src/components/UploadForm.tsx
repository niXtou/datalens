import { useState, useRef, useEffect } from 'react'
import type { components } from '../types/api'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import AnalysisStream from './AnalysisStream'
import ResultsDashboard from './ResultsDashboard'
import { UploadCloud, FileText, ArrowRight, RotateCcw, Download, Settings } from 'lucide-react'
import { downloadJson } from '../lib/downloads'
import { columnBadgeVariant, columnBadgeLabel } from '../lib/formatters'

type UploadResponse  = components['schemas']['UploadResponse']
type ColumnSchema    = components['schemas']['ColumnSchema']
type ResultsResponse = components['schemas']['ResultsResponse']
type AppStep         = 'upload' | 'analyse' | 'results'

const ALL_ANALYSES = [
  { id: 'run_clustering', label: 'Clustering',        description: 'K-Means — groups similar rows together' },
  { id: 'run_regression', label: 'Regression',        description: 'Linear regression — predicts a numeric target' },
  { id: 'run_anomaly',    label: 'Anomaly detection', description: 'IsolationForest — flags unusual rows' },
]

interface Props {
  step:             AppStep
  fileId:           string | null
  filename:         string | null
  preloadedColumns: ColumnSchema[]
  onUploaded:       (fileId: string, filename: string, columns: ColumnSchema[]) => void
  onAnalysisDone:   () => void
  onRerun:          () => void
  onReset:          () => void
}

// Columns eligible to appear in the regression target dropdown:
// numeric columns + class_label columns (integers the user may want to predict).
function targetEligible(col: ColumnSchema) {
  return col.column_type === 'numeric' || col.column_type === 'class_label'
}

function defaultTarget(columns: ColumnSchema[]): string | null {
  const eligible = columns.filter(targetEligible)
  // Mirror the backend's last-column heuristic (last *continuous* numeric column).
  const numeric = eligible.filter(c => c.column_type === 'numeric')
  const pool = numeric.length > 0 ? numeric : eligible
  return pool.length > 0 ? pool[pool.length - 1].name : null
}

function AnalysisSelector({
  columns,
  selectedAnalyses,
  onToggle,
  targetColumn,
  onTargetChange,
}: {
  columns: ColumnSchema[]
  selectedAnalyses: string[]
  onToggle: (id: string) => void
  targetColumn: string | null
  onTargetChange: (col: string | null) => void
}) {
  const targetCols   = columns.filter(targetEligible)
  const regressionOn = selectedAnalyses.includes('run_regression')

  return (
    <div className="flex flex-col gap-3">
      {ALL_ANALYSES.map(a => (
        <label key={a.id} className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selectedAnalyses.includes(a.id)}
            onChange={() => onToggle(a.id)}
            style={{ marginTop: '3px', accentColor: 'var(--color-accent)', width: '15px', height: '15px', flexShrink: 0 }}
          />
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>{a.label}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>{a.description}</p>
          </div>
        </label>
      ))}

      {regressionOn && targetCols.length > 0 && (
        <div className="mt-1 pt-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text)' }}>
              Regression target column
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>
              The column regression will try to predict. Numeric and class-label columns are eligible.
            </span>
            <select
              value={targetColumn ?? ''}
              onChange={e => onTargetChange(e.target.value || null)}
              style={{
                marginTop: '2px',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                fontSize: '0.875rem',
                fontFamily: 'var(--font-mono, monospace)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {targetCols.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name}{c.column_type === 'class_label' ? ' (class label)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

export default function UploadForm({
  step, fileId, filename, preloadedColumns,
  onUploaded, onAnalysisDone, onRerun, onReset,
}: Props) {
  const [uploadResult,     setUploadResult]     = useState<UploadResponse | null>(null)
  const [selectedFile,     setSelectedFile]     = useState<File | null>(null)
  const [uploading,        setUploading]        = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [dragging,         setDragging]         = useState(false)
  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>(ALL_ANALYSES.map(a => a.id))
  const [targetColumn,     setTargetColumn]     = useState<string | null>(null)
  const [forceRerun,       setForceRerun]       = useState(false)
  const [showReconfig,     setShowReconfig]     = useState(false)
  const [reconfigAnalyses, setReconfigAnalyses] = useState<string[]>(ALL_ANALYSES.map(a => a.id))
  const [reconfigTarget,   setReconfigTarget]   = useState<string | null>(null)
  const [resultsData,      setResultsData]      = useState<ResultsResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Default the regression target to the last numeric column whenever a new
  // upload result arrives — mirrors the backend's own default behaviour.
  useEffect(() => {
    if (!uploadResult) return
    setTargetColumn(defaultTarget(uploadResult.columns))
  }, [uploadResult])

  // Seed the reconfigure panel from current selections when it opens.
  useEffect(() => {
    if (!showReconfig) return
    setReconfigAnalyses(selectedAnalyses)
    setReconfigTarget(targetColumn ?? defaultTarget(preloadedColumns))
  }, [showReconfig]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(file: File) {
    setSelectedFile(file)
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Upload failed: ${res.statusText}`)
      }
      const data: UploadResponse = await res.json()
      setUploadResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFile(file)
    else setError('Please drop a CSV file.')
  }

  function handleRunAnalysis() {
    if (!uploadResult) return
    onUploaded(uploadResult.file_id, selectedFile?.name ?? uploadResult.file_id, uploadResult.columns)
  }

  function handleReconfigRun() {
    setSelectedAnalyses(reconfigAnalyses)
    setTargetColumn(reconfigTarget)
    setForceRerun(true)
    setShowReconfig(false)
    setResultsData(null)
    onRerun()
  }

  // ── Step: Upload ────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="animate-fade-up flex flex-col gap-6">
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', marginBottom: '6px' }}>
            Upload your dataset
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            Choose a CSV file to begin. The agent will infer column types automatically.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={[
            'border-2 border-dashed rounded-[var(--radius-lg)] p-12 text-center cursor-pointer transition-all duration-200',
            dragging
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-accent-muted)] hover:bg-[var(--color-accent-soft)]',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center"
              style={{ background: 'var(--color-accent-soft)' }}
            >
              <UploadCloud size={22} style={{ color: 'var(--color-accent)' }} />
            </div>
            {selectedFile ? (
              <div className="flex items-center gap-2">
                <FileText size={14} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text)', fontWeight: 500 }}>
                  {selectedFile.name}
                </span>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text)', fontWeight: 500 }}>
                  Drop a CSV here or click to browse
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-subtle)' }}>
                  Supports .csv files
                </p>
              </>
            )}
          </div>
        </div>

        {/* Column preview */}
        {uploadResult && (
          <Card className="animate-fade-up">
            <CardHeader>
              <div className="flex items-center justify-between">
                <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                  {uploadResult.columns.length} columns detected
                </p>
                <Badge variant="success">Ready</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y divide-[var(--color-border-light)]">
                {uploadResult.columns.map((col: ColumnSchema) => (
                  <div key={col.name} className="flex items-center justify-between py-2">
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {col.name}
                    </span>
                    <Badge variant={columnBadgeVariant(col.column_type)}>
                      {columnBadgeLabel(col.column_type)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analysis selector */}
        {uploadResult && (
          <Card className="animate-fade-up">
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>Select analyses to run</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>Uncheck any you want to skip</p>
            </CardHeader>
            <CardContent>
              <AnalysisSelector
                columns={uploadResult.columns}
                selectedAnalyses={selectedAnalyses}
                onToggle={id => setSelectedAnalyses(prev =>
                  prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
                )}
                targetColumn={targetColumn}
                onTargetChange={setTargetColumn}
              />
            </CardContent>
          </Card>
        )}

        {error && (
          <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>
        )}

        {uploadResult && (
          <Button
            size="full"
            disabled={selectedAnalyses.length === 0}
            onClick={handleRunAnalysis}
            className="animate-fade-up"
          >
            {uploading ? 'Uploading…' : 'Run Analysis'}
            <ArrowRight size={15} />
          </Button>
        )}

        {!uploadResult && uploading && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
            Uploading…
          </p>
        )}
      </div>
    )
  }

  // ── Step: Analyse ───────────────────────────────────────────────────────────
  if (step === 'analyse' && fileId) {
    return (
      <AnalysisStream
        fileId={fileId}
        analyses={selectedAnalyses}
        targetColumn={targetColumn}
        force={forceRerun}
        onDone={() => { setForceRerun(false); onAnalysisDone() }}
      />
    )
  }

  // ── Step: Results ───────────────────────────────────────────────────────────
  if (step === 'results' && fileId) {
    const displayName = filename ?? selectedFile?.name ?? 'Your dataset'
    const columns     = uploadResult?.columns ?? preloadedColumns

    return (
      <div className="animate-fade-up flex flex-col gap-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', marginBottom: '6px' }}>
              Analysis results
            </h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>{displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            {resultsData && (
              <Button variant="outline" size="sm" onClick={() => downloadJson(resultsData, displayName)}>
                <Download size={13} />
                Download JSON
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReconfig(v => !v)}
              style={showReconfig ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
            >
              <Settings size={13} />
              Re-configure
            </Button>
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw size={13} />
              Upload new file
            </Button>
          </div>
        </div>

        {/* Re-configure panel */}
        {showReconfig && columns.length > 0 && (
          <Card className="animate-fade-up">
            <CardHeader>
              <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>Re-configure analysis</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                Adjust the settings and re-run on the same dataset
              </p>
            </CardHeader>
            <CardContent>
              <AnalysisSelector
                columns={columns}
                selectedAnalyses={reconfigAnalyses}
                onToggle={id => setReconfigAnalyses(prev =>
                  prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
                )}
                targetColumn={reconfigTarget}
                onTargetChange={setReconfigTarget}
              />
              <div className="flex justify-end mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <Button
                  disabled={reconfigAnalyses.length === 0}
                  onClick={handleReconfigRun}
                >
                  Run Analysis
                  <ArrowRight size={15} />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <ResultsDashboard
          fileId={fileId}
          filename={displayName}
          onDataLoaded={setResultsData}
        />
      </div>
    )
  }

  return null
}
