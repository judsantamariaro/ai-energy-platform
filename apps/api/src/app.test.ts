import { describe, expect, it } from 'vitest';
import { HealthResponse } from '@aiem/shared';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('responde ok con el contrato compartido', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ status: 'ok', version: '0.1.0' });
    await app.close();
  });
});
