import { useState, useEffect } from 'react'
import type { components } from './types/api'
import UploadForm from './components/UploadForm'

type AppStep    = 'upload' | 'analyse' | 'results'
type ColumnSchema = components['schemas']['ColumnSchema']

const STEPS: { id: AppStep; label: string }[] = [
  { id: 'upload',  label: 'Upload' },
  { id: 'analyse', label: 'Analyse' },
  { id: 'results', label: 'Results' },
]

const SESSION_KEY = 'datalens_session'

function Stepper({ current }: { current: AppStep }) {
  const currentIdx = STEPS.findIndex(s => s.id === current)

  return (
    <div className="flex items-center justify-center select-none">
      {STEPS.map((step, i) => {
        const done   = i < currentIdx
        const active = i === currentIdx
        const future = i > currentIdx

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300',
                  done   ? 'bg-[var(--color-accent)] text-white'                                                     : '',
                  active ? 'bg-[var(--color-accent)] text-white ring-4 ring-[var(--color-accent-soft)]'              : '',
                  future ? 'bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-subtle)]' : '',
                ].join(' ')}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className={[
                  'text-xs font-medium transition-colors duration-300',
                  active ? 'text-[var(--color-accent)]' : '',
                  done   ? 'text-[var(--color-muted)]'  : '',
                  future ? 'text-[var(--color-subtle)]' : '',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'w-16 h-px mb-5 mx-3 transition-all duration-500',
                  i < currentIdx ? 'bg-[var(--color-accent-muted)]' : 'bg-[var(--color-border)]',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [step,    setStep]    = useState<AppStep>('upload')
  const [fileId,  setFileId]  = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [columns, setColumns] = useState<ColumnSchema[]>([])
  const [apiOk,   setApiOk]   = useState<boolean | null>(null)

  // Restore last completed analysis from localStorage so a page refresh
  // doesn't send the user back to the upload step.
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        const { fileId: id, filename: name, columns: cols } = JSON.parse(saved) as {
          fileId: string; filename: string; columns: ColumnSchema[]
        }
        setFileId(id)
        setFilename(name)
        setColumns(cols ?? [])
        setStep('results')
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
    }
  }, [])

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/health`)
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false))
  }, [])

  function handleUploaded(id: string, name: string, cols: ColumnSchema[]) {
    setFileId(id)
    setFilename(name)
    setColumns(cols)
    setStep('analyse')
  }

  function handleAnalysisDone() {
    setStep('results')
    if (fileId && filename) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ fileId, filename, columns }))
    }
  }

  function handleRerun() {
    setStep('analyse')
  }

  function handleReset() {
    setStep('upload')
    setFileId(null)
    setFilename(null)
    setColumns([])
    localStorage.removeItem(SESSION_KEY)
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem' }}>
              DataLens <em style={{ color: 'var(--color-accent)', fontStyle: 'italic' }}>AI</em>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginTop: '2px' }}>
              Upload a dataset. Watch the agent think. See the results.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={[
                'w-1.5 h-1.5 rounded-full transition-colors',
                apiOk === null  ? 'bg-[var(--color-subtle)]'  : '',
                apiOk === true  ? 'bg-[var(--color-success)]' : '',
                apiOk === false ? 'bg-red-400'                : '',
              ].join(' ')}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-subtle)' }}>
              {apiOk === null ? 'connecting' : apiOk ? 'online' : 'offline'}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] py-6">
        <div className="max-w-3xl mx-auto px-6">
          <Stepper current={step} />
        </div>
      </div>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">
        <UploadForm
          step={step}
          fileId={fileId}
          filename={filename}
          preloadedColumns={columns}
          onUploaded={handleUploaded}
          onAnalysisDone={handleAnalysisDone}
          onRerun={handleRerun}
          onReset={handleReset}
        />
      </main>

      <footer className="border-t border-[var(--color-border)] py-4">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p style={{ fontSize: '0.75rem', color: 'var(--color-subtle)' }}>
            DataLens — LangGraph · FastAPI · React
          </p>
        </div>
      </footer>
    </div>
  )
}
