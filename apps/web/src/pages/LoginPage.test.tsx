import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '@/test/render';
import { LoginPage } from './LoginPage';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** API simulada: sin sesión al entrar; el login responde según la contraseña. */
function mockApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/me')
      return json(401, { error: 'Unauthorized', message: 'Inicia sesión' });
    if (url === '/api/auth/login') {
      const { password } = JSON.parse(String(init?.body));
      return password === 'energia2026'
        ? json(200, { id: 1, email: 'demo@bia.energy', name: 'Analista de energía' })
        : json(401, { error: 'Unauthorized', message: 'Correo o contraseña incorrectos' });
    }
    return json(404, { error: 'Not Found', message: url });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('con las credenciales de demo entra y va al dashboard', async () => {
    const fetchMock = mockApi();
    renderPage(<LoginPage />, {
      path: '/login',
      extraRoutes: [{ path: '/', element: <p>Dashboard</p> }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Usar credenciales de demo' }));
    expect(screen.getByLabelText('Correo')).toHaveValue('demo@bia.energy');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('muestra el error si la contraseña es incorrecta', async () => {
    mockApi();
    renderPage(<LoginPage />, { path: '/login' });

    await userEvent.type(screen.getByLabelText('Correo'), 'demo@bia.energy');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos'),
    );
  });
});
