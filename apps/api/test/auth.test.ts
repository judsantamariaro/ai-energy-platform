import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, readSessionToken } from '../src/auth/session.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { positiveNumber } from '../src/config.js';
import { createTestApp, DEMO, type TestApp } from './helpers.js';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(() => t.close());

describe('login', () => {
  it('con credenciales correctas devuelve el usuario y una cookie httpOnly', async () => {
    const { res } = await t.login();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: DEMO.email, name: DEMO.name });
    const cookie = res.cookies.find((c) => c.name === 'aiem_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('acepta el correo sin importar mayúsculas', async () => {
    expect((await t.login('DEMO@Bia.Energy')).res.statusCode).toBe(200);
  });

  it('rechaza una contraseña incorrecta sin decir cuál dato falló', async () => {
    const { res, cookie } = await t.login(DEMO.email, 'otra');
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Correo o contraseña incorrectos');
    expect(cookie).toBeNull();
  });

  it('valida el cuerpo de la petición', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('rutas protegidas', () => {
  it.each(['/api/meters', '/api/anomalies', '/api/dashboard/summary', '/api/auth/me'])(
    '%s sin sesión responde 401',
    async (url) => {
      const res = await t.app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    },
  );

  it('una cookie manipulada no da acceso', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'aiem_session=1.9999999999999.firma-falsa' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('con sesión, /auth/me devuelve el usuario', async () => {
    const res = await t.api('GET', '/api/auth/me');
    expect(res.json()).toMatchObject({ email: DEMO.email });
  });

  it('health y la documentación son públicas', async () => {
    const health = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toMatchObject({ status: 'ok', llm: { mode: 'none', available: false } });
    expect((await t.app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(200);
  });
});

describe('límite de intentos', () => {
  it('después de 10 intentos por minuto, el login responde 429', async () => {
    // createTestApp ya hizo 1 login, así que quedan 9 intentos antes del límite.
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await t.login(DEMO.email, 'mala')).res.statusCode);
    expect(statuses.slice(0, 9)).toEqual(Array(9).fill(401));
    expect(statuses[9]).toBe(429);
    const blocked = await t.login(DEMO.email, DEMO.password);
    expect(blocked.res.json()).toMatchObject({ error: 'Too Many Requests' });
  });
});

describe('configuración', () => {
  it('rechaza valores no numéricos o no positivos', () => {
    expect(positiveNumber('SESSION_HOURS', undefined, 8)).toBe(8);
    expect(positiveNumber('SESSION_HOURS', '0.5', 8)).toBe(0.5);
    expect(() => positiveNumber('SESSION_HOURS', '8h', 8)).toThrow('SESSION_HOURS');
    expect(() => positiveNumber('SESSION_HOURS', '-1', 8)).toThrow();
  });
});

describe('token de sesión y contraseña', () => {
  it('el token expira y no se puede falsificar', () => {
    const token = createSessionToken(7, 'secreto', 1000, 0);
    expect(readSessionToken(token, 'secreto', 500)).toBe(7);
    expect(readSessionToken(token, 'secreto', 1000)).toBeNull();
    expect(readSessionToken(token, 'otro-secreto', 500)).toBeNull();
    expect(readSessionToken(token.replace(/^7/, '8'), 'secreto', 500)).toBeNull();
  });

  it('el hash de la contraseña usa sal: dos hashes distintos, ambos válidos', async () => {
    const [a, b] = [hashPassword('clave'), hashPassword('clave')];
    expect(a).not.toBe(b);
    expect(await verifyPassword('clave', a)).toBe(true);
    expect(await verifyPassword('otra', a)).toBe(false);
  });

  it('un token con expiración no numérica nunca es válido', () => {
    expect(readSessionToken('1.NaN.firma', 'secreto')).toBeNull();
    expect(() => createSessionToken(1, 'secreto', Number.NaN)).toThrow();
  });
});
