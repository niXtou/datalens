import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader } from './ui/card'
import { CheckCircle, Loader } from 'lucide-react'

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

  // Keep a stable ref so the stream closure always calls the latest onDone
  // without re-triggering the effect when the parent re-renders.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    async function stream() {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/analyse/${fileId}`, {
          method: 'POST',
        })
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`)
        }
        if (!response.body) {
          throw new Error('Response body is empty')
        }
        const reader  = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const event of parseSseChunk(decoder.decode(value))) {
            if (event.type === 'step') setLog(prev => [...prev, event.data])
            else if (event.type === 'done') {
              setIsDone(true)
              setTimeout(() => onDoneRef.current(), 1200)
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Stream error')
      }
    }
    stream()
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
