# ADR 0002 — Fastify como framework de la API

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

La API es pequeña (unos 8 endpoints más la autenticación), pero debe validar entradas, ser fácil de
testear y tener un tipado fuerte.

## Opciones

- **Express**: el más conocido, pero sin validación ni tipado de rutas integrados.
- **NestJS**: estructura por módulos e inyección de dependencias; agrega mucho código repetitivo
  para una API de este tamaño.
- **Fastify**: validación por esquema, plugins encapsulados, logger integrado (pino) y `inject`
  para testear sin abrir puertos.

## Decisión

Fastify. La app se construye con `buildApp()` sin escuchar en un puerto, y los tests usan
`app.inject()`. Todas las rutas cuelgan de `/api`.

## Consecuencias

- La validación con zod se integra en la F4 con un type provider.
- En desarrollo, Vite hace de proxy de `/api` hacia la API, así que no hace falta configurar CORS.
