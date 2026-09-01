import { useState, useRef, useEffect } from 'react'
import type { components } from '../types/api'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import AnalysisStream from './AnalysisStream'
import ResultsDashboard from './ResultsDashboard'
import { UploadCloud, FileText, ArrowRight, RotateCcw, Download, Settings } from 'lucide-react'
import { downloadJson } from '../lib/downloads'
import { columnBadgeVariant, columnBadgeLabel, formatColumnDetail, formatMissing } from '../lib/formatters'

type UploadResponse  = components['schemas']['UploadResponse']
type ColumnSchema    = components['schemas']['ColumnSchema']
type ResultsResponse = components['schemas']['ResultsResponse']
type AppStep         = 'upload' | 'analyse' | 'results'

// Columns eligible to appear in the regression target dropdown:
// numeric columns + class_label columns (integers the user may want to predict).
function targetEligible(col: ColumnSchema) {
  return col.column_type === 'numeric' || col.column_type === 'class_label'
}

// Columns eligible as a classification target: detected class labels plus any
// text/boolean column — the backend rejects high-cardinality ones at run time.
function classificationEligible(col: ColumnSchema) {
  return col.column_type === 'class_label' || col.column_type === 'categorical'
}

interface AnalysisOption {
  id:          string
  label:       string
  description: string
  // Whether the dataset's columns satisfy the tool's prerequisites (mirrors the backend).
  available:   (columns: ColumnSchema[]) => boolean
  // Shown next to a disabled checkbox when `available` is false.
  hint?:       string
}

const ALL_ANALYSES: AnalysisOption[] = [
  {
    id: 'run_clustering', label: 'Clustering',
    description: 'K-Means — groups similar rows together',
    available: cols => cols.filter(targetEligible).length >= 1,
  },
  {
    id: 'run_regression', label: 'Regression',
    description: 'Linear regression — predicts a numeric target',
    available: cols => cols.filter(targetEligible).length >= 2,
  },
  {
    id: 'run_classification', label: 'Classification',
    description: 'RandomForest — predicts a category, cross-validated',
    available: cols => cols.some(classificationEligible) && cols.some(c => c.column_type === 'numeric'),
    hint: 'needs a class-label or categorical column',
  },
  {
    id: 'run_anomaly', label: 'Anomaly detection',
    description: 'IsolationForest — flags unusual rows',
    available: cols => cols.filter(targetEligible).length >= 1,
  },
  {
    id: 'run_correlation', label: 'Correlation',
    description: 'Pearson matrix of numeric columns',
    available: cols => cols.filter(targetEligible).length >= 2,
  },
]

// Only classification is hard-disabled without a target; the others degrade
// gracefully on the backend (a skipped step in the log), so they stay clickable.
const HARD_GATED = new Set(['run_classification'])

function defaultAnalyses(columns: ColumnSchema[]): string[] {
  return ALL_ANALYSES.filter(a => a.available(columns)).map(a => a.id)
}

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

function defaultTarget(columns: ColumnSchema[]): string | null {
  const eligible = columns.filter(targetEligible)
  // Mirror the backend's last-column heuristic (last *continuous* numeric column).
  const numeric = eligible.filter(c => c.column_type === 'numeric')
  const pool = numeric.length > 0 ? numeric : eligible
  return pool.length > 0 ? pool[pool.length - 1].name : null
}

function defaultClassificationTarget(columns: ColumnSchema[]): string | null {
  // Mirror the backend's auto-pick: first class_label column, else first categorical.
  const eligible = columns.filter(classificationEligible)
  const labelled = eligible.find(c => c.column_type === 'class_label')
  return labelled?.name ?? eligible[0]?.name ?? null
}

const selectStyle: React.CSSProperties = {
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
}

function TargetSelect({
  title, help, value, options, onChange,
}: {
  title:    string
  help:     string
  value:    string | null
  options:  ColumnSchema[]
  onChange: (col: string | null) => void
}) {
  return (
    <div className="mt-1 pt-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text)' }}>{title}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>{help}</span>
        <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} style={selectStyle}>
          {options.map(c => (
            <option key={c.name} value={c.name}>
              {c.name}{c.column_type === 'class_label' ? ' (class label)' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function AnalysisSelector({
  columns,
  selectedAnalyses,
  onToggle,
  targetColumn,
  onTargetChange,
  classificationTarget,
  onClassificationTargetChange,
}: {
  columns: ColumnSchema[]
  selectedAnalyses: string[]
  onToggle: (id: string) => void
  targetColumn: string | null
  onTargetChange: (col: string | null) => void
  classificationTarget: string | null
  onClassificationTargetChange: (col: string | null) => void
}) {
  const targetCols       = columns.filter(targetEligible)
  const classCols        = columns.filter(classificationEligible)
  const regressionOn     = selectedAnalyses.includes('run_regression')
  const classificationOn = selectedAnalyses.includes('run_classification')

  return (
    <div className="flex flex-col gap-3">
      {ALL_ANALYSES.map(a => {
        const disabled = HARD_GATED.has(a.id) && !a.available(columns)
        return (
          <label
            key={a.id}
            className={`flex items-start gap-3 select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            style={disabled ? { opacity: 0.55 } : undefined}
          >
            <input
              type="checkbox"
              checked={selectedAnalyses.includes(a.id)}
              disabled={disabled}
              onChange={() => onToggle(a.id)}
              style={{ marginTop: '3px', accentColor: 'var(--color-accent)', width: '15px', height: '15px', flexShrink: 0 }}
            />
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>{a.label}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-subtle)' }}>
                {a.description}
                {disabled && a.hint && (
                  <span style={{ color: 'var(--color-accent)' }}> — {a.hint}</span>
                )}
              </p>
            </div>
          </label>
        )
      })}

      {regressionOn && targetCols.length > 0 && (
        <TargetSelect
          title="Regression target column"
          help="The column regression will try to predict. Numeric and class-label columns are eligible."
          value={targetColumn}
          options={targetCols}
          onChange={onTargetChange}
        />
      )}

      {classificationOn && classCols.length > 0 && (
        <TargetSelect
          title="Classification target column"
          help="The category the classifier will try to predict. Class-label and categorical columns are eligible."
          value={classificationTarget}
          options={classCols}
          onChange={onClassificationTargetChange}
        />
      )}
    </div>
  )
}

const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }
const headStyle: React.CSSProperties = { ...cellStyle, color: 'var(--color-muted)', fontWeight: 500, textAlign: 'left' }

function ColumnPreviewTable({ columns }: { columns: ColumnSchema[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={headStyle}>Name</th>
            <th style={headStyle}>Type</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Missing</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Unique</th>
            <th style={headStyle}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {columns.map(col => {
            const missing = col.profile.missing_pct
            return (
              <tr key={col.name} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <td style={{ ...cellStyle, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text)' }}>
                  {col.name}
                </td>
                <td style={cellStyle}>
                  <Badge variant={columnBadgeVariant(col.column_type)}>
                    {columnBadgeLabel(col.column_type)}
                  </Badge>
                </td>
                <td
                  style={{
                    ...cellStyle,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: missing > 0 ? 'var(--color-accent)' : 'var(--color-subtle)',
                  }}
                >
                  {formatMissing(missing)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-muted)' }}>
                  {col.profile.unique_count}
                </td>
                <td
                  style={{
                    ...cellStyle,
                    color: 'var(--color-muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.75rem',
                    maxWidth: 320,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={formatColumnDetail(col.column_type, col.profile)}
                >
                  {formatColumnDetail(col.column_type, col.profile)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
  const [selectedAnalyses,     setSelectedAnalyses]     = useState<string[]>(ALL_ANALYSES.map(a => a.id))
  const [targetColumn,         setTargetColumn]         = useState<string | null>(null)
  const [classificationTarget, setClassificationTarget] = useState<string | null>(null)
  const [forceRerun,           setForceRerun]           = useState(false)
  const [showReconfig,         setShowReconfig]         = useState(false)
  const [reconfigAnalyses,     setReconfigAnalyses]     = useState<string[]>(ALL_ANALYSES.map(a => a.id))
  const [reconfigTarget,       setReconfigTarget]       = useState<string | null>(null)
  const [reconfigClassTarget,  setReconfigClassTarget]  = useState<string | null>(null)
  const [resultsData,          setResultsData]          = useState<ResultsResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Whenever a new upload result arrives: pre-select every analysis the columns
  // can support and default both targets the way the backend would pick them.
  useEffect(() => {
    if (!uploadResult) return
    setSelectedAnalyses(defaultAnalyses(uploadResult.columns))
    setTargetColumn(defaultTarget(uploadResult.columns))
    setClassificationTarget(defaultClassificationTarget(uploadResult.columns))
  }, [uploadResult])

  // Seed the reconfigure panel from current selections when it opens.
  useEffect(() => {
    if (!showReconfig) return
    setReconfigAnalyses(selectedAnalyses)
    setReconfigTarget(targetColumn ?? defaultTarget(preloadedColumns))
    setReconfigClassTarget(classificationTarget ?? defaultClassificationTarget(preloadedColumns))
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
    setClassificationTarget(reconfigClassTarget)
    setForceRerun(true)
    setShowReconfig(false)
    setResultsData(null)
    onRerun()
  }

  // ── Step: Upload ────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="animate-fade-up flex flex-col gap-10">
        <section>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.5rem',
              lineHeight: 1.05,
              maxWidth: '18ch',
              marginBottom: '14px',
            }}
          >
            Upload a dataset. Watch the agent think.
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '1rem', maxWidth: '58ch', lineHeight: 1.55 }}>
            DataLens runs a small LangGraph agent over your CSV — clustering, regression,
            classification, anomaly detection and correlation from scikit-learn, streamed back as it works.
          </p>
        </section>

        {!uploadResult && (
          <section aria-label="How it works">
            <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: '24px' }}>
              {[
                { n: '01', label: 'Inspect',  body: 'We infer column types from your CSV automatically.' },
                { n: '02', label: 'Analyse',  body: 'A LangGraph agent runs clustering, regression, classification, anomaly detection and correlation.' },
                { n: '03', label: 'Report',   body: 'Charts and a plain-prose summary, streamed back live.' },
              ].map((s, i) => (
                <div key={s.n} className="relative" style={i > 0 ? { paddingLeft: 12 } : {}}>
                  {i > 0 && (
                    <div
                      aria-hidden
                      className="hidden sm:block absolute"
                      style={{ left: -12, top: 4, bottom: 4, width: 1, background: 'var(--color-border-light)' }}
                    />
                  )}
                  <div className="mono-cap" style={{ color: 'var(--color-accent)', marginBottom: 6 }}>
                    {s.n}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.15rem',
                      lineHeight: 1.2,
                      marginBottom: 4,
                    }}
                  >
                    {s.label}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.55 }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

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
                  {uploadResult.row_count.toLocaleString()} rows · {uploadResult.columns.length} columns
                </p>
                <Badge variant="success">Ready</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ColumnPreviewTable columns={uploadResult.columns} />
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
                classificationTarget={classificationTarget}
                onClassificationTargetChange={setClassificationTarget}
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
        classificationTarget={classificationTarget}
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
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', marginBottom: '6px' }}>
              Analysis results
            </h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.95rem' }}>{displayName}</p>
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
                classificationTarget={reconfigClassTarget}
                onClassificationTargetChange={setReconfigClassTarget}
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
