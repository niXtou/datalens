import { useState, useRef } from 'react'
import type { components } from '../types/api'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import AnalysisStream from './AnalysisStream'
import ResultsDashboard from './ResultsDashboard'
import { UploadCloud, FileText, ArrowRight, RotateCcw } from 'lucide-react'

type UploadResponse = components['schemas']['UploadResponse']
type ColumnSchema   = components['schemas']['ColumnSchema']
type AppStep        = 'upload' | 'analyse' | 'results'

interface Props {
  step:            AppStep
  fileId:          string | null
  onUploaded:      (fileId: string) => void
  onAnalysisDone:  () => void
  onReset:         () => void
}

function columnBadgeVariant(type: string) {
  if (type === 'numeric')     return 'numeric'     as const
  if (type === 'categorical') return 'categorical' as const
  if (type === 'datetime')    return 'datetime'    as const
  return 'muted' as const
}

export default function UploadForm({ step, fileId, onUploaded, onAnalysisDone, onReset }: Props) {
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading]       = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [dragging, setDragging]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setSelectedFile(file)
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
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
                      {col.column_type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <p style={{ color: '#c0392b', fontSize: '0.85rem' }}>{error}</p>
        )}

        {uploadResult && (
          <Button
            size="full"
            onClick={() => onUploaded(uploadResult.file_id)}
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
      <div className="animate-fade-up">
        <AnalysisStream fileId={fileId} onDone={onAnalysisDone} />
      </div>
    )
  }

  // ── Step: Results ───────────────────────────────────────────────────────────
  if (step === 'results' && fileId) {
    return (
      <div className="animate-fade-up flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', marginBottom: '6px' }}>
              Analysis results
            </h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
              {selectedFile?.name ?? 'Your dataset'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw size={13} />
            New analysis
          </Button>
        </div>
        <ResultsDashboard fileId={fileId} />
      </div>
    )
  }

  return null
}
