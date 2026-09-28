import type {
  AnalysisRun,
  AnomalyDetail,
  AnomalyListItem,
  AnomalyStatus,
  AnomalyType,
  DashboardSummary,
  HealthResponse,
  MeterDetail,
  MeterListItem,
  MeterSort,
  MeterStatus,
  Reading,
  Severity,
  UpdateAnomalyRequest,
  User,
} from '@aiem/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  /** Códigos de error que devuelven un cuerpo útil (p. ej. 409 con el análisis en curso). */
  acceptStatus: number[] = [],
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok && !acceptStatus.includes(res.status)) {
    throw new ApiError(res.status, data?.message ?? `Error ${res.status}`);
  }
  return data as T;
}

function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string] => e[1] !== undefined && e[1] !== '',
  );
  return entries.length > 0 ? `?${new URLSearchParams(entries)}` : '';
}

export interface MeterFilters {
  status?: MeterStatus | undefined;
  search?: string | undefined;
  sort?: MeterSort | undefined;
  order?: 'asc' | 'desc' | undefined;
}

export interface AnomalyFilters {
  type?: AnomalyType | undefined;
  severity?: Severity | undefined;
  status?: AnomalyStatus | undefined;
  meterId?: string | undefined;
}

export const api = {
  health: () => request<HealthResponse>('GET', '/health'),
  login: (email: string, password: string) =>
    request<User>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<User>('GET', '/auth/me'),

  dashboard: () => request<DashboardSummary>('GET', '/dashboard/summary'),

  meters: (filters: MeterFilters = {}) =>
    request<MeterListItem[]>('GET', `/meters${query({ ...filters })}`),
  meter: (meterId: string) => request<MeterDetail>('GET', `/meters/${encodeURIComponent(meterId)}`),
  readings: (meterId: string) =>
    request<Reading[]>('GET', `/meters/${encodeURIComponent(meterId)}/readings`),

  anomalies: (filters: AnomalyFilters = {}) =>
    request<AnomalyListItem[]>('GET', `/anomalies${query({ ...filters })}`),
  anomaly: (id: string) => request<AnomalyDetail>('GET', `/anomalies/${encodeURIComponent(id)}`),
  updateAnomaly: (id: string, change: UpdateAnomalyRequest) =>
    request<AnomalyDetail>('PATCH', `/anomalies/${encodeURIComponent(id)}`, change),

  /** Devuelve el análisis creado (202) o el que ya estaba en curso (409). */
  startAnalysis: () => request<AnalysisRun>('POST', '/ai/analyze', undefined, [409]),
  analysis: (id: string) => request<AnalysisRun>('GET', `/ai/analysis/${encodeURIComponent(id)}`),
  latestAnalysis: () => request<AnalysisRun | null>('GET', '/ai/analysis/latest'),
};
