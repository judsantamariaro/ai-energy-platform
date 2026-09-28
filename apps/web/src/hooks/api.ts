import { useEffect, useRef } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { AnalysisRun, UpdateAnomalyRequest } from '@aiem/shared';
import { api, ApiError, type AnomalyFilters, type MeterFilters } from '@/lib/api';

export const keys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  meters: (f: MeterFilters = {}) => ['meters', f] as const,
  meter: (id: string) => ['meter', id] as const,
  readings: (id: string) => ['readings', id] as const,
  anomalies: (f: AnomalyFilters = {}) => ['anomalies', f] as const,
  anomaly: (id: string) => ['anomaly', id] as const,
  latestAnalysis: ['analysis', 'latest'] as const,
  health: ['health'] as const,
};

const isRunning = (run: AnalysisRun | null | undefined) =>
  run?.status === 'PENDING' || run?.status === 'RUNNING';

/** Todo lo que cambia cuando termina un análisis o se actúa sobre una anomalía. */
export function invalidateAnalysisData(client: QueryClient) {
  for (const key of [['dashboard'], ['meters'], ['meter'], ['anomalies'], ['anomaly']]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

// ─── Sesión ────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.login(email, password),
    onSuccess: (user) => client.setQueryData(keys.me, user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      client.clear();
      client.setQueryData(keys.me, null);
    },
  });
}

// ─── Datos ─────────────────────────────────────────────────────────────────────

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: api.dashboard });

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 30_000 });

export const useMeters = (filters: MeterFilters) =>
  useQuery({
    queryKey: keys.meters(filters),
    queryFn: () => api.meters(filters),
    placeholderData: keepPreviousData,
  });

// `enabled`: en la Investigación el medidor se conoce recién cuando carga la anomalía.
export const useMeter = (id: string) =>
  useQuery({ queryKey: keys.meter(id), queryFn: () => api.meter(id), enabled: id !== '' });

export const useReadings = (id: string) =>
  useQuery({
    queryKey: keys.readings(id),
    queryFn: () => api.readings(id),
    staleTime: Infinity,
    enabled: id !== '',
  });

export const useAnomalies = (filters: AnomalyFilters = {}) =>
  useQuery({
    queryKey: keys.anomalies(filters),
    queryFn: () => api.anomalies(filters),
    placeholderData: keepPreviousData,
  });

export const useAnomaly = (id: string) =>
  useQuery({ queryKey: keys.anomaly(id), queryFn: () => api.anomaly(id) });

export function useUpdateAnomaly(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: UpdateAnomalyRequest) => api.updateAnomaly(id, change),
    onSuccess: (detail) => {
      client.setQueryData(keys.anomaly(id), detail);
      invalidateAnalysisData(client);
    },
  });
}

// ─── Análisis ──────────────────────────────────────────────────────────────────

/**
 * El análisis más reciente. Mientras está en curso se consulta cada segundo (F4-a); cuando
 * termina, se refrescan el dashboard, los medidores y las anomalías.
 */
export function useLatestAnalysis() {
  const client = useQueryClient();
  const result = useQuery({
    queryKey: keys.latestAnalysis,
    queryFn: api.latestAnalysis,
    refetchInterval: (q) => (isRunning(q.state.data) ? 1000 : false),
  });

  const previous = useRef<AnalysisRun | null | undefined>(undefined);
  useEffect(() => {
    const run = result.data;
    if (isRunning(previous.current) && run && !isRunning(run)) invalidateAnalysisData(client);
    previous.current = run;
  }, [result.data, client]);

  return { ...result, running: isRunning(result.data) };
}

export function useStartAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.startAnalysis,
    onSuccess: (run) => client.setQueryData(keys.latestAnalysis, run),
  });
}
