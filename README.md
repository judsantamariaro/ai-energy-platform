# AI Energy Management Platform

MVP para gestionar medidores eléctricos y usar IA para **detectar, explicar, priorizar y recomendar
acciones** sobre anomalías de consumo.

Ciclo que demuestra la solución: **datos → análisis → anomalía → explicación → priorización → acción**.

> Estado: **F0 — setup** completado. Ver [hoja de ruta](#hoja-de-ruta).

## Stack

| Capa              | Tecnología                                   |
| ----------------- | -------------------------------------------- |
| Lenguaje          | TypeScript (estricto) en todo el stack       |
| Monorepo          | pnpm workspaces                              |
| API               | Node 22 + Fastify                            |
| Persistencia      | SQLite + Drizzle ORM                         |
| Frontend          | React + Vite                                 |
| Contratos         | zod, compartidos entre API y frontend        |
| Testing / calidad | Vitest, ESLint (typescript-eslint), Prettier |

Las razones de cada decisión están en [`docs/adr/`](docs/adr/).

## Estructura

```
apps/
  api/        API REST (Fastify)
  web/        Frontend (React + Vite)
packages/
  shared/     Tipos y esquemas zod compartidos (contratos de la API)
  engine/     Motor analítico puro: baseline, detección, clasificación (sin HTTP ni BD)
data/         Datasets de entrada (readings.csv, events.csv)
docs/adr/     Registro de decisiones de arquitectura
```

## Requisitos

- Node.js ≥ 22.12
- pnpm ≥ 8

## Cómo correrlo

```bash
pnpm install
pnpm dev          # API en http://localhost:3000 · Web en http://localhost:5173
```

| Script       | Qué hace                                                  |
| ------------ | --------------------------------------------------------- |
| `pnpm dev`   | Levanta API y web en modo watch                           |
| `pnpm build` | Build de producción de todos los paquetes                 |
| `pnpm test`  | Tests de todos los paquetes                               |
| `pnpm check` | Verificación completa: formato + lint + typecheck + tests |

## Datos

- `data/readings.csv` — 4.032 lecturas horarias de 12 medidores (2026-09-01 → 2026-09-14).
- `data/events.csv` — eventos operativos conocidos.
- `expected_results.csv` es el ground truth del evaluador: **no forma parte del repo** (está en
  `.gitignore`) y el motor nunca lo usa.

## Hoja de ruta

| Fase | Alcance                                                                | Estado |
| ---- | ---------------------------------------------------------------------- | ------ |
| F0   | Setup: monorepo, TypeScript, lint, tests, dev/build                    | ✅     |
| F1   | Datos: modelo, BD, migraciones, carga de CSV con validación            | ⏳     |
| F2   | Motor analítico validado contra los casos del dataset                  | ⏳     |
| F3   | Capa IA: explicación y recomendación sustentadas en evidencia          | ⏳     |
| F4   | API completa + análisis asíncrono por etapas                           | ⏳     |
| F5   | Frontend SaaS: dashboard, medidores, detalle, anomalías, investigación | ⏳     |
| F6   | Calidad: tests e2e, documentación                                      | ⏳     |
| F7   | Demo                                                                   | ⏳     |
