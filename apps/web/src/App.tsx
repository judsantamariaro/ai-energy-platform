import { createBrowserRouter } from 'react-router';
import { RequireAuth } from '@/components/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** Cada pantalla se descarga al visitarla por primera vez (divide el bundle por ruta). */
function page<M extends Record<string, React.ComponentType>>(
  load: () => Promise<M>,
  name: keyof M,
) {
  return async () => ({ Component: (await load())[name] });
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, lazy: page(() => import('@/pages/DashboardPage'), 'DashboardPage') },
          { path: 'meters', lazy: page(() => import('@/pages/MetersPage'), 'MetersPage') },
          {
            path: 'meters/:meterId',
            lazy: page(() => import('@/pages/MeterDetailPage'), 'MeterDetailPage'),
          },
          { path: 'anomalies', lazy: page(() => import('@/pages/AnomaliesPage'), 'AnomaliesPage') },
          {
            path: 'anomalies/:id',
            lazy: page(() => import('@/pages/InvestigationPage'), 'InvestigationPage'),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
