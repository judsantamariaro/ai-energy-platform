import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnomalyDetail, AnomalyListItem } from '@aiem/shared';
import { anomalies } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
  await t.runAnalysis();
});
afterAll(() => t.close());

const anomalyOf = async (meterId: string) =>
  ((await t.api('GET', `/api/anomalies?meterId=${meterId}`)).json() as AnomalyListItem[])[0]!;

describe('una anomalía cerrada que vuelve más grave', () => {
  it('se reabre sola y lo deja registrado en el historial', async () => {
    const { id } = await anomalyOf('M-104');
    await t.api('PATCH', `/api/anomalies/${id}`, { status: 'RESOLVED', note: 'Revisado' });
    // Simula que cuando el usuario la resolvió era de severidad baja; ahora el motor la ve media.
    t.db.update(anomalies).set({ severity: 'LOW' }).where(eq(anomalies.id, id)).run();

    await t.runAnalysis();

    const detail = (await t.api('GET', `/api/anomalies/${id}`)).json() as AnomalyDetail;
    expect(detail).toMatchObject({ status: 'OPEN', severity: 'MEDIUM' });
    expect(detail.actions.at(-1)).toMatchObject({
      status: 'OPEN',
      user: null,
      note: 'Reabierta automáticamente: un nuevo análisis la detectó con severidad media (antes baja).',
    });
  });

  it('si la severidad no sube, conserva el estado que le dio el usuario', async () => {
    const { id } = await anomalyOf('M-112');
    await t.api('PATCH', `/api/anomalies/${id}`, { status: 'DISMISSED' });

    await t.runAnalysis();

    expect((await anomalyOf('M-112')).status).toBe('DISMISSED');
    expect((await t.api('GET', `/api/anomalies/${id}`)).json()).toMatchObject({ severity: 'HIGH' });
  });
});
