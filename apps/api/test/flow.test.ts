import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AnalysisRun,
  AnomalyDetail,
  AnomalyListItem,
  DashboardSummary,
  MeterDetail,
  MeterListItem,
} from '@aiem/shared';
import { createTestApp, type TestApp } from './helpers.js';

/**
 * El flujo de la demo sobre el dataset entregado:
 * Login → Dashboard → Medidores → Run AI Analysis → Anomalías → Investigación → Acción.
 */
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const get = async <T>(url: string) => {
  const res = await t.api('GET', url);
  expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
  return res.json() as T;
};

describe('antes del primer análisis', () => {
  it('el dashboard muestra los 12 medidores, el consumo y ningún análisis', async () => {
    const d = await get<DashboardSummary>('/api/dashboard/summary');
    expect(d.meters).toEqual({ total: 12, byStatus: { OK: 12, ALERT: 0, CRITICAL: 0 } });
    expect(d.consumption.daily).toHaveLength(14);
    expect(d.consumption.totalKwh).toBeCloseTo(155250.8, 0);
    expect(d.anomalies.detected).toBe(0);
    expect(d.lastAnalysis).toBeNull();
  });

  it('los medidores tienen consumo, pero no baseline ni variación', async () => {
    const meters = await get<MeterListItem[]>('/api/meters');
    expect(meters).toHaveLength(12);
    expect(meters.every((m) => m.readings === 336 && m.current === null)).toBe(true);
  });

  it('no hay análisis que consultar', async () => {
    expect((await t.api('GET', '/api/ai/analysis/latest')).statusCode).toBe(404);
  });
});

describe('Run AI Analysis', () => {
  let run: AnalysisRun;

  beforeAll(async () => {
    const { res, id } = await t.runAnalysis();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'PENDING' });
    run = await get<AnalysisRun>(`/api/ai/analysis/${id}`);
  });

  it('completa las 7 etapas del enunciado, cada una con su resumen', () => {
    expect(run.status).toBe('COMPLETED');
    expect(run.stages.map((s) => s.stage)).toEqual([
      'READINGS',
      'BASELINE',
      'DETECTION',
      'CORRELATION',
      'EVENTS',
      'EXPLANATION',
      'RECOMMENDATION',
    ]);
    for (const stage of run.stages) {
      expect(stage.status).toBe('DONE');
      expect(stage.summary).toBeTruthy();
      expect(stage.finishedAt).toBeTruthy();
    }
    expect(run.stages[0]!.summary).toBe('4032 lecturas de 12 medidores.');
  });

  it('termina con el mensaje del enunciado: 4 anomalías · 2 prioritarias', () => {
    expect(run.summary).toMatchObject({
      anomaliesDetected: 4,
      highPriority: 2,
      llm: null,
      message: '4 anomalías detectadas · 2 requieren atención prioritaria',
    });
  });

  it('es el análisis más reciente', async () => {
    expect((await get<AnalysisRun>('/api/ai/analysis/latest')).id).toBe(run.id);
  });

  it('404 para un análisis que no existe', async () => {
    expect((await t.api('GET', '/api/ai/analysis/no-existe')).statusCode).toBe(404);
  });
});

describe('después del análisis', () => {
  const anomalyOf = async (meterId: string) =>
    (await get<AnomalyListItem[]>(`/api/anomalies?meterId=${meterId}`))[0]!;

  it('lista las 4 anomalías por prioridad; el falso positivo nace descartado', async () => {
    const list = await get<AnomalyListItem[]>('/api/anomalies');
    expect(list.map((a) => [a.meterId, a.type, a.severity, a.status, a.recommendedAction])).toEqual(
      [
        ['M-109', 'REAL_ANOMALY', 'HIGH', 'OPEN', 'Investigar medidor e instalación'],
        ['M-112', 'DATA_QUALITY', 'HIGH', 'OPEN', 'Validar medidor y datos'],
        ['M-104', 'EXPLAINABLE_ANOMALY', 'MEDIUM', 'OPEN', 'Validar operación'],
        ['M-106', 'FALSE_POSITIVE', 'LOW', 'DISMISSED', 'No escalar'],
      ],
    );
    expect(list[0]!.meterName).toBe('Planta Metalmecánica');
  });

  it('filtra por tipo y severidad', async () => {
    expect(
      (await get<AnomalyListItem[]>('/api/anomalies?severity=HIGH')).map((a) => a.meterId),
    ).toEqual(['M-109', 'M-112']);
    expect(await get<AnomalyListItem[]>('/api/anomalies?type=FALSE_POSITIVE')).toHaveLength(1);
    expect((await t.api('GET', '/api/anomalies?severity=ENORME')).statusCode).toBe(400);
  });

  it('la investigación de M-109 trae explicación, pasos, evidencia y el origen del texto', async () => {
    const a = await get<AnomalyDetail>(`/api/anomalies/${(await anomalyOf('M-109')).id}`);
    expect(a.reason).toBe(
      'Consumo +107,9 % por encima del baseline sin evento que lo explique y con cambios eléctricos.',
    );
    expect(a.explanation).toContain('UNKNOWN');
    expect(a.steps.length).toBeGreaterThan(0);
    expect(a.insight).toEqual({ source: 'TEMPLATE', model: null, fallbackReason: null });
    expect(a.evidence).toMatchObject({
      signals: expect.arrayContaining(['POWER_FACTOR_DEGRADATION']),
    });
    expect(a.meterLocation).toBe('Bucaramanga · Girón');
    expect(a.actions).toEqual([]);
  });

  it('el falso positivo registra quién lo descartó: el sistema', async () => {
    const a = await get<AnomalyDetail>(`/api/anomalies/${(await anomalyOf('M-106')).id}`);
    expect(a.actions).toMatchObject([{ status: 'DISMISSED', user: null }]);
  });

  it('los medidores quedan con estado, consumo actual y baseline', async () => {
    const meters = await get<MeterListItem[]>('/api/meters?sort=severity&order=desc');
    expect(meters.slice(0, 3).map((m) => [m.meterId, m.status])).toEqual([
      ['M-109', 'CRITICAL'],
      // Entre dos ALERT, primero el de la anomalía más severa (M-112 HIGH sobre M-104 MEDIUM).
      ['M-112', 'ALERT'],
      ['M-104', 'ALERT'],
    ]);
    const m109 = meters[0]!;
    expect(m109.current!.variation).toBeGreaterThan(1);
    expect(m109.topAnomaly).toMatchObject({ type: 'REAL_ANOMALY', severity: 'HIGH' });
    expect(meters.find((m) => m.meterId === 'M-106')).toMatchObject({
      status: 'OK',
      topAnomaly: null,
    });
  });

  it('filtra medidores por estado y busca por id o nombre', async () => {
    expect(
      (await get<MeterListItem[]>('/api/meters?status=CRITICAL')).map((m) => m.meterId),
    ).toEqual(['M-109']);
    expect((await get<MeterListItem[]>('/api/meters?search=m-11')).map((m) => m.meterId)).toEqual([
      'M-110',
      'M-111',
      'M-112',
    ]);
    expect(
      (await get<MeterListItem[]>('/api/meters?search=metalmec')).map((m) => m.meterId),
    ).toEqual(['M-109']);
  });

  it('ordena por variación de mayor a menor', async () => {
    const meters = await get<MeterListItem[]>('/api/meters?sort=variation&order=desc');
    expect(meters.slice(0, 2).map((m) => m.meterId)).toEqual(['M-109', 'M-104']);
  });

  it('el detalle de M-109 trae baseline horario, anomalías y eventos', async () => {
    const m = await get<MeterDetail>('/api/meters/M-109');
    expect(m.baselineProfile!.kwh).toHaveLength(24);
    expect(m.baselineDayKwh).toBeGreaterThan(1000);
    expect(m.anomalies).toHaveLength(1);
    expect(m.events).toMatchObject([{ type: 'UNKNOWN', timestamp: '2026-09-12T14:00:00.000Z' }]);
    expect((await t.api('GET', '/api/meters/M-999')).statusCode).toBe(404);
  });

  it('entrega las lecturas horarias y permite acotarlas por fecha', async () => {
    expect(await get<unknown[]>('/api/meters/M-109/readings')).toHaveLength(336);
    const day = await get<{ timestamp: string }[]>(
      '/api/meters/M-109/readings?from=2026-09-12T00:00:00.000Z&to=2026-09-12T23:00:00.000Z',
    );
    expect(day).toHaveLength(24);
    expect(day[0]!.timestamp).toBe('2026-09-12T00:00:00.000Z');
  });

  it('el dashboard refleja el análisis', async () => {
    const d = await get<DashboardSummary>('/api/dashboard/summary');
    expect(d.meters.byStatus).toEqual({ OK: 9, ALERT: 2, CRITICAL: 1 });
    expect(d.anomalies).toMatchObject({ detected: 4, highPriority: 2 });
    expect(d.anomalies.top.map((a) => a.meterId)).toEqual(['M-109', 'M-112', 'M-104']);
    expect(d.lastAnalysis).toMatchObject({ status: 'COMPLETED' });
  });
});

describe('la Acción sobre una anomalía', () => {
  let id: string;
  beforeAll(async () => {
    id = (await get<AnomalyListItem[]>('/api/anomalies?meterId=M-109'))[0]!.id;
  });

  it('registra cada cambio de estado con nota y usuario', async () => {
    const res = await t.api('PATCH', `/api/anomalies/${id}`, {
      status: 'IN_PROGRESS',
      note: 'Cuadrilla enviada a revisar la instalación',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'IN_PROGRESS',
      actions: [
        {
          status: 'IN_PROGRESS',
          note: 'Cuadrilla enviada a revisar la instalación',
          user: 'Analista de energía',
        },
      ],
    });
  });

  it('resolver la anomalía saca al medidor de estado crítico', async () => {
    await t.api('PATCH', `/api/anomalies/${id}`, { status: 'RESOLVED', note: 'Carga reubicada' });
    expect((await get<MeterDetail>('/api/meters/M-109')).status).toBe('OK');
    expect((await get<DashboardSummary>('/api/dashboard/summary')).anomalies.highPriority).toBe(1);
  });

  it('valida el estado y responde 404 si la anomalía no existe', async () => {
    expect((await t.api('PATCH', `/api/anomalies/${id}`, { status: 'CERRADA' })).statusCode).toBe(
      400,
    );
    expect(
      (await t.api('PATCH', '/api/anomalies/no-existe', { status: 'RESOLVED' })).statusCode,
    ).toBe(404);
  });

  it('un nuevo análisis conserva el id, el estado y el historial de cada anomalía', async () => {
    const before = await get<AnomalyListItem[]>('/api/anomalies');
    await t.runAnalysis();
    const after = await get<AnomalyListItem[]>('/api/anomalies');

    expect(after.map((a) => a.id)).toEqual(before.map((a) => a.id));
    const m109 = await get<AnomalyDetail>(`/api/anomalies/${id}`);
    expect(m109.status).toBe('RESOLVED');
    expect(m109.actions.map((a) => a.status)).toEqual(['IN_PROGRESS', 'RESOLVED']);
    expect((await get<MeterDetail>('/api/meters/M-109')).status).toBe('OK');
  });
});

describe('concurrencia', () => {
  it('si ya hay un análisis en curso, responde 409 con ese análisis', async () => {
    const first = await t.api('POST', '/api/ai/analyze');
    const second = await t.api('POST', '/api/ai/analyze');
    expect(second.statusCode).toBe(409);
    expect(second.json().id).toBe(first.json().id);
    await t.runAnalysis().catch(() => {});
  });
});
