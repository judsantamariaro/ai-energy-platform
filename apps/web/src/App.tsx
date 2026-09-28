import { useEffect, useState } from 'react';
import { HealthResponse } from '@aiem/shared';

type ApiState = { kind: 'loading' } | { kind: 'ok'; version: string } | { kind: 'error' };

/** Placeholder de la F0: solo verifica que web → API funciona. La UI real llega en la F5. */
export function App() {
  const [api, setApi] = useState<ApiState>({ kind: 'loading' });

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setApi({ kind: 'ok', version: HealthResponse.parse(body).version }))
      .catch(() => setApi({ kind: 'error' }));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>AI Energy Management</h1>
      <p>
        API: {api.kind === 'loading' && 'conectando…'}
        {api.kind === 'ok' && `ok (v${api.version})`}
        {api.kind === 'error' && 'sin conexión'}
      </p>
    </main>
  );
}
