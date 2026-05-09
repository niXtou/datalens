import { useState, useEffect } from "react";


function parseSseChunk(raw: string) {
    return raw
        .split("\n")
        .filter(line => line.startsWith("data: "))
        .map(line => JSON.parse(line.slice(6)));
}

export default function AnalysisStream({ fileId }: { fileId: string }) {
    const [log, setLog] = useState<string[]>([]);
    const [isDone, setIsDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function stream() {
            try {
                // fetch -> reader -> decoder -> loop -> parse -> setState
                const response = await fetch(`${import.meta.env.VITE_API_URL}/analyse/${fileId}`, {
                    method: "POST",
                });
                const reader = response.body!.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value);
                    for (const event of parseSseChunk(text)) {
                        if (event.type === 'step') {
                            setLog(prev => [...prev, event.data]);
                        } else if (event.type === 'done') {
                            setIsDone(true);
                        }
                    }
                }
            } catch (err) {
                setError(err instanceof Error ? "Stream error: " + err.message : String(err));
            }
        }
        stream();
    }, []);

    return (
        <div>
          <h2>Analysis</h2>
          {!isDone && <p>Running... ⏳</p>}
          <ul>
              {log.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
          {isDone && <p>✅ Analysis complete.</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );

}