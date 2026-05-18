import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
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

        const nodeStyle: React.CSSProperties = {
          width: 26,
          height: 26,
          fontVariantNumeric: 'tabular-nums',
          ...(done && {
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
          }),
          ...(active && {
            background: 'var(--color-accent)',
            color: '#fff',
            boxShadow: '0 0 0 2px rgba(201, 100, 66, 0.15)',
          }),
          ...(!done && !active && {
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-light)',
            color: 'var(--color-subtle)',
          }),
        }

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300"
                style={nodeStyle}
              >
                {done ? <Check size={12} strokeWidth={2.5} /> : i + 1}
              </div>
              <span
                className="mono-cap"
                style={{
                  color: active ? 'var(--color-accent)'
                       : done   ? 'var(--color-muted)'
                                : 'var(--color-subtle)',
                  transition: 'color 300ms',
                }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="transition-all duration-500"
                style={{
                  width: 80,
                  height: 1,
                  marginBottom: 20,
                  marginInline: 12,
                  background: i < currentIdx ? 'var(--color-accent-muted)' : 'var(--color-border-light)',
                }}
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
      <header className="border-b bg-[var(--color-surface)]" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-3xl mx-auto px-6 pt-5 pb-7">
          <div className="flex items-center justify-between mb-7">
            <a
              href="/"
              className="flex items-baseline gap-3 group"
              style={{ textDecoration: 'none' }}
            >
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.9rem',
                  lineHeight: 1.05,
                  transition: 'color 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text)')}
              >
                DataLens
              </h1>
              <span
                aria-hidden
                style={{
                  width: 1,
                  height: 14,
                  background: 'var(--color-border)',
                  display: 'inline-block',
                }}
              />
              <span className="mono-cap" style={{ color: 'var(--color-subtle)' }}>
                Agentic ML on your CSV
              </span>
            </a>

            <nav className="flex items-center" style={{ fontSize: '0.8rem' }}>
              <a
                href={`${import.meta.env.VITE_API_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-muted)', transition: 'color 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
              >
                API Docs
              </a>
            </nav>
          </div>

          <Stepper current={step} />
        </div>
      </header>

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

      <footer className="border-t mt-8" style={{ borderColor: 'var(--color-border)' }}>
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between mono-cap" style={{ color: 'var(--color-subtle)' }}>
          <span>
            Built by{' '}
            <a
              href="https://www.nstoug.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
            >
              nstoug
            </a>
          </span>
          <a
            href="https://github.com/niXtou/datalens"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
          >
            Source
          </a>
        </div>
      </footer>
    </div>
  )
}
