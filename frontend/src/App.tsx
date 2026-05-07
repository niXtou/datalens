import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [status, setStatus] = useState<'loading' | 'healthy' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    fetch('http://localhost:8000/health')
      .then(res => res.json())
      .then(data => {
        setStatus('healthy');
        setMessage('Backend is online');
      })
      .catch(err => {
        setStatus('error');
        setMessage(`Error: ${err.message}`);
      });
  }, []);

  return (
    <div>
      <h1>DataLens AI</h1>
      <p>Status: {status === 'loading' ? 'Checking...' : status}</p>
      <p>{message}</p>
    </div>
  )
}

export default App
