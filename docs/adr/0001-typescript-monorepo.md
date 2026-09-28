# ADR 0001 — TypeScript en todo el stack, monorepo con pnpm workspaces

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

El enunciado sugiere Go como lenguaje preferente, pero permite usar otro. La solución tiene
frontend, API y un motor analítico que debe poder testearse de forma aislada.

## Decisión

- TypeScript estricto en API, frontend y motor.
- Monorepo con pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`, `packages/engine`.
- Los paquetes internos exportan TypeScript fuente: la API los empaqueta con tsup y el frontend con
  Vite, así que no hay un paso de build intermedio.

## Consecuencias

- Los contratos de la API (esquemas zod en `shared`) son una sola fuente de verdad para servidor y
  cliente: un cambio de contrato rompe el typecheck en ambos lados.
- `engine` no depende de HTTP ni de la base de datos, así que se testea con datos en memoria. Si se
  quisiera portar el backend a Go, el motor es la pieza a reescribir y sus tests sirven de
  especificación.
- TypeScript se fija en `~6.0` porque `typescript-eslint` todavía no soporta TypeScript 7.
