import { useEffect, useState } from 'react';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; timestamp: string }
  | { status: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    fetch('http://localhost:4000/api/health')
      .then((response) => response.json())
      .then((data: { ok: boolean; timestamp: string }) => {
        if (data.ok) {
          setHealth({ status: 'ok', timestamp: data.timestamp });
        } else {
          setHealth({ status: 'error', message: 'Unexpected response' });
        }
      })
      .catch((error: Error) => {
        setHealth({ status: 'error', message: error.message });
      });
  }, []);

  return (
    <div className="container">
      <h1>Chayxana Master</h1>
      {health.status === 'loading' && <p>Tekshirilmoqda...</p>}
      {health.status === 'ok' && (
        <p className="ok">Server bilan aloqa o&apos;rnatildi. Vaqt: {health.timestamp}</p>
      )}
      {health.status === 'error' && <p className="error">Xato: {health.message}</p>}
    </div>
  );
}
