import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader } from './ui/card'
import { CheckCircle, Loader } from 'lucide-react'

// Delay before transitioning to the results view after the stream completes,
// giving the results endpoint time to persist before ResultsDashboard fetches it.
const RESULTS_TRANSITION_DELAY_MS = 2500

function parseSseChunk(raw: string) {
  return raw
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)))
}

interface Props {
  fileId: string
  onDone: () => void
}

export default function AnalysisStream({ fileId, onDone }: Props) {
  const [log, setLog]       = useState<string[]>([])
  const [isDone, setIsDone] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Stable ref so the stream closure always calls the latest onDone
  // without including it in the effect deps (which would restart the stream).
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    // AbortController lets us cancel the fetch on cleanup.
    // React StrictMode in dev mounts → unmounts → remounts effects; without
    // this the first request would keep running alongside the second, causing
    // duplicate stream messages and two concurrent agent runs on the server.
    const controller = new AbortController()

    async function stream() {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/analyse/${fileId}`, {
          method: 'POST',
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
            if (event.type === 'step') setLog(prev => [...prev, event.data])
            else if (event.type === 'error') setError(`Agent error: ${event.data}`)
            else if (event.type === 'done') {
              setIsDone(true)
              setTimeout(() => onDoneRef.current(), RESULTS_TRANSITION_DELAY_MS)
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
  }, [fileId])

  return (
    <div className="flex flex-col gap-6">
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
            <p style={{ color: '#c0392b', fontSize: '0.85rem' }}>{error}</p>
          )}
          <div className="flex flex-col gap-2">
            {log.map((msg, i) => (
              <div
                key={i}
                className="flex items-start gap-3 animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: 'var(--color-accent-muted)' }}
                />
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
