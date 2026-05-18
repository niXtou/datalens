import { useState, useEffect, useRef } from 'react'
import { POLL_MAX_ATTEMPTS, POLL_INTERVAL_MS } from '../lib/constants'

interface LogEntry { msg: string; t: number }

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

function formatElapsed(ms: number) {
  const s = ms / 1000
  return s < 10 ? `0${s.toFixed(1)}s` : `${s.toFixed(1)}s`
}

interface Props {
  fileId:       string
  analyses:     string[]
  targetColumn: string | null
  force:        boolean
  onDone:       () => void
}

export default function AnalysisStream({ fileId, analyses, targetColumn, force, onDone }: Props) {
  const [log, setLog]           = useState<LogEntry[]>([])
  const [isDone, setIsDone]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [elapsedMs, setElapsed] = useState(0)
  // Set in the streaming useEffect below before any interval tick reads it.
  const startTimeRef            = useRef<number>(0)

  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    if (isDone) return
    const id = setInterval(() => {
      setElapsed(performance.now() - startTimeRef.current)
    }, 100)
    return () => clearInterval(id)
  }, [isDone])

  useEffect(() => {
    // AbortController prevents duplicate agent runs on cleanup (React StrictMode double-mount).
    const controller = new AbortController()
    startTimeRef.current = performance.now()

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
              const t = performance.now() - startTimeRef.current
              setLog(prev => [...prev, { msg: event.data, t }])
            } else if (event.type === 'error') {
              setError(`Agent error: ${event.data}`)
            } else if (event.type === 'done') {
              setIsDone(true)
              setElapsed(performance.now() - startTimeRef.current)
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

  const headline =
    isDone           ? 'Analysis complete.' :
    log.length === 0 ? 'Reading your dataset…' :
                       log[log.length - 1].msg

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <div>
        <h2
          key={headline}
          className="animate-fade-in"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: '2rem',
            color: 'var(--color-accent)',
            lineHeight: 1.2,
            letterSpacing: '-0.005em',
          }}
        >
          {headline}
        </h2>
        <p
          className="mono-cap"
          style={{
            color: 'var(--color-subtle)',
            marginTop: 8,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isDone ? 'Completed' : 'Running'} · {formatElapsed(elapsedMs)}
        </p>
      </div>

      {error && (
        <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>
      )}

      <div className="relative">
        {log.length > 0 && (
          <div
            aria-hidden
            className="absolute"
            style={{
              left: 7,
              top: 10,
              bottom: 10,
              width: 1,
              background: 'var(--color-border-light)',
            }}
          />
        )}

        <div className="flex flex-col gap-3.5">
          {log.map((entry, i) => {
            const isLast      = i === log.length - 1
            const isActive    = isLast && !isDone
            const isCompleted = isDone && isLast
            const nodeSize    = isActive ? 10 : 6
            const nodeColor   =
              isCompleted ? 'var(--color-success)'      :
              isActive    ? 'var(--color-accent)'       :
                            'var(--color-accent-muted)'

            return (
              <div
                key={i}
                className="flex items-center gap-3 animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      width: nodeSize,
                      height: nodeSize,
                      borderRadius: '50%',
                      background: nodeColor,
                      animation: isActive ? 'pulse-halo 1.4s ease-in-out infinite' : 'none',
                      transition: 'width 200ms, height 200ms, background-color 200ms',
                    }}
                  />
                </div>
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.875rem',
                    color: 'var(--color-text)',
                    lineHeight: 1.5,
                  }}
                >
                  {entry.msg}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-subtle)',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  +{(entry.t / 1000).toFixed(1)}s
                </span>
              </div>
            )
          })}

          {!isDone && log.length > 0 && (
            <div className="flex items-center gap-3 animate-fade-in">
              <div style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              </div>
              <span
                className="animate-shimmer"
                style={{ height: 10, width: '45%', borderRadius: 3, flexShrink: 0 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
