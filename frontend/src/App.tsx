import { useState, useEffect } from 'react'
import './App.css'
import UploadForm from './components/UploadForm';

function App() {
  const [status, setStatus] = useState<'loading' | 'healthy' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/health`)
      .then(res => res.json())
      .then(_data => {
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
      
      <UploadForm />
    </div>
  )
}

export default App
