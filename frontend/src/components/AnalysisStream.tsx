import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader } from './ui/card'
import { CheckCircle, Loader } from 'lucide-react'
import { POLL_MAX_ATTEMPTS, POLL_INTERVAL_MS } from '../lib/constants'

function parseSseChunk(raw: string) {
  return raw
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)))
}

async function pollForResults(fileId: string, signal: AbortSignal): Promise<void> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    if (signal.aborted) return
    const r = await fetch(`${import.meta.env.VITE_API_URL}/results/${fileId}`, { signal })
      .catch(() => null)
    if (r?.ok) return
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    if (signal.aborted) return
  }
}

interface Props {
  fileId:       string
  analyses:     string[]
  targetColumn: string | null
  force:        boolean
  onDone:       () => void
}

export default function AnalysisStream({ fileId, analyses, targetColumn, force, onDone }: Props) {
  const [log, setLog]       = useState<string[]>([])
  const [isDone, setIsDone] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    // AbortController prevents duplicate agent runs on cleanup (React StrictMode double-mount).
    const controller = new AbortController()

    async function stream() {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/analyse/${fileId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analyses, target_column: targetColumn, force }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`)
        }
        if (!response.body) {
          throw new Error('Response body is empty')
        }
        const reader  = response.body.getReader()
        // stream: true keeps the decoder buffer open across calls so multi-byte
        // UTF-8 characters that span chunk boundaries are decoded correctly.
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true })

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const event of parseSseChunk(decoder.decode(value, { stream: true }))) {
            if (event.type === 'step') {
              setLog(prev => [...prev, event.data])
            } else if (event.type === 'error') {
              setError(`Agent error: ${event.data}`)
            } else if (event.type === 'done') {
              setIsDone(true)
              // Poll until results are readable, then transition — more reliable
              // than a fixed delay, and usually resolves in the first attempt.
              await pollForResults(fileId, controller.signal)
              if (!controller.signal.aborted) onDoneRef.current()
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'Stream error')
      }
    }
    stream()

    return () => controller.abort()
  }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', marginBottom: '6px' }}>
          {isDone ? 'Analysis complete' : 'Agent is thinking…'}
        </h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
          {isDone
            ? 'All analyses finished. Loading your results.'
            : 'Sit tight while the LangGraph agent runs your analyses.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {isDone ? (
              <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
            ) : (
              <Loader
                size={16}
                style={{ color: 'var(--color-accent)', animation: 'spin 1.5s linear infinite' }}
              />
            )}
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-muted)' }}>
              {isDone ? 'Done' : 'Running'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>
          )}
          <div className="flex flex-col gap-2">
            {log.map((msg, i) => (
              <div
                key={i}
                className="flex items-start gap-3 animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span style={{ fontSize: '0.78rem', color: 'var(--color-accent-muted)', marginRight: '2px', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: '1.5rem', textAlign: 'right' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: '1.5' }}>
                  {msg}
                </span>
              </div>
            ))}
            {!isDone && log.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: 'var(--color-accent)',
                    animation: 'pulse-dot 1s ease-in-out infinite',
                  }}
                />
                <span style={{ fontSize: '0.875rem', color: 'var(--color-subtle)' }}>
                  Working…
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
