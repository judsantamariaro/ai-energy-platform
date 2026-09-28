import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '@/test/render';
import { AnalysisPanelProvider } from './AnalysisPanel';
import { useAnalysisPanel } from './context';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function Trigger() {
  const { run } = useAnalysisPanel();
  return <button onClick={run}>Lanzar</button>;
}

afterEach(() => vi.unstubAllGlobals());

describe('AnalysisPanel', () => {
  it('si la API no puede iniciar el análisis, lo dice en el panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/ai/analysis/latest') return json(200, null);
        if (url === '/api/ai/analyze' && init?.method === 'POST') {
          return json(500, {
            error: 'Internal Server Error',
            message: 'Error interno del servidor',
          });
        }
        return json(404, { error: 'Not Found', message: url });
      }),
    );
    renderPage(
      <AnalysisPanelProvider>
        <Trigger />
      </AnalysisPanelProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Lanzar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo iniciar el análisis: Error interno del servidor',
    );
    expect(screen.getByText('Aún no se ha ejecutado un análisis.')).toBeInTheDocument();
  });
});
