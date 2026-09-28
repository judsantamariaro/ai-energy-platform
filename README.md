# AI Energy Management Platform

MVP para gestionar medidores eléctricos y usar IA para **detectar, explicar, priorizar y recomendar
acciones** sobre anomalías de consumo.

Ciclo que demuestra la solución: **datos → análisis → anomalía → explicación → priorización → acción**.

> Estado: **F4 — API** completada. Ver [hoja de ruta](#hoja-de-ruta).

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
- pnpm ≥ 10

## Cómo correrlo

```bash
pnpm install
pnpm dev          # API en http://localhost:3000 · Web en http://localhost:5173
```

Usuario de demostración: **demo@bia.energy** / **energia2026**. La configuración opcional está en
[`apps/api/.env.example`](apps/api/.env.example).

La primera vez que arranca, la API crea la base SQLite (`apps/api/.data/aiem.db`), aplica las
migraciones y carga los datos de `data/`. Para regenerarla desde cero: `pnpm db:reset`.

| Script          | Qué hace                                                          |
| --------------- | ----------------------------------------------------------------- |
| `pnpm dev`      | Levanta API y web en modo watch                                   |
| `pnpm build`    | Build de producción de todos los paquetes                         |
| `pnpm test`     | Tests de todos los paquetes                                       |
| `pnpm check`    | Verificación completa: formato + lint + typecheck + tests         |
| `pnpm db:reset` | Borra la base y la regenera desde `data/` con un informe de carga |

## Datos

- `data/readings.csv` — 4.032 lecturas horarias de 12 medidores (2026-09-01 → 2026-09-14).
- `data/events.csv` — eventos operativos conocidos.
- `data/meters.json` — nombre y ubicación de cada medidor. **Son datos ficticios**: los CSV no traen
  metadatos y el modelo de datos del enunciado los pide.

Reglas de carga (detalle en [ADR 0004](docs/adr/0004-ingesta-y-zona-horaria.md)):

- Se rechaza solo lo que no se puede interpretar: fecha ilegible, texto en un campo numérico o
  falta el medidor. Cada rechazo se informa con su línea.
- Las lecturas físicamente raras (p. ej. 202 V) **se conservan**: detectarlas es trabajo del motor.
- Un valor vacío se guarda como dato faltante (`null`).
- Los timestamps (sin zona en los CSV) se interpretan y guardan en **UTC**.
- La carga es idempotente: repetirla no duplica filas.
- `expected_results.csv` es el ground truth del evaluador: **no forma parte del repo** (está en
  `.gitignore`) y el motor nunca lo usa.

## Motor de anomalías

Reglas estadísticas explicables, sin ML (detalle y datos que respaldan cada umbral en
[ADR 0005](docs/adr/0005-motor-de-anomalias.md)):

1. **Baseline:** mediana por hora del día de cada medidor.
2. **Detección:** incidentes de consumo (≥ 3 h a más de ±25 % del baseline) e incidentes de calidad
   de datos (voltaje fuera de banda, saltos bruscos, relación kWh / V·I·PF errática).
3. **Correlación:** cambios en factor de potencia, voltaje y relación física durante el incidente.
4. **Eventos:** solo un cambio operativo (aumento) o una parada programada con recuperación
   explican un cambio; un evento `UNKNOWN` no.
5. **Priorización:** rango por tipo y severidad, y posición según magnitud, riesgo y vigencia.

Resultado sobre el dataset entregado:

| Medidor | Tipo                | Severidad | Confianza | Prioridad | Estado   |
| ------- | ------------------- | --------- | --------- | --------- | -------- |
| M-109   | REAL_ANOMALY        | HIGH      | 0,97      | 100       | CRITICAL |
| M-112   | DATA_QUALITY        | HIGH      | 0,96      | 73,1      | ALERT    |
| M-104   | EXPLAINABLE_ANOMALY | MEDIUM    | 0,97      | 29,3      | ALERT    |
| M-106   | FALSE_POSITIVE      | LOW       | 0,99      | 6,4       | OK       |

Los otros 8 medidores no tienen hallazgos. Mover cualquier umbral ±20 % no cambia el resultado
(test de sensibilidad en `packages/engine/test/dataset.test.ts`).

## Capa de IA

La explicación y la recomendación de cada hallazgo salen de `packages/ai`
([ADR 0006](docs/adr/0006-capa-de-ia.md)):

- **Sin configurar nada**, se generan con plantillas a partir de la evidencia del motor.
- **Con [Ollama](https://ollama.com)** instalado y el modelo `qwen2.5:3b` descargado, un LLM libre
  y local redacta la explicación y los pasos a seguir. Si su respuesta cita un número que no está
  en la evidencia, afirma una causa desconocida o falla, se usa la plantilla.
- La acción principal siempre sale de las reglas: el LLM no puede recomendar algo incoherente.

```bash
ollama pull qwen2.5:3b
pnpm --filter @aiem/ai compare-models qwen2.5:3b   # prueba el modelo con los hallazgos reales
```

## API

Documentación interactiva (OpenAPI) en **http://localhost:3000/docs**. Todas las rutas van bajo
`/api` y, salvo `health` y `auth/login`, requieren sesión ([ADR 0007](docs/adr/0007-api-y-analisis-asincrono.md)).

| Método | Ruta                           | Qué hace                                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| POST   | `/auth/login` · `/auth/logout` | Inicia o cierra la sesión (cookie httpOnly)                                                            |
| GET    | `/auth/me`                     | Usuario de la sesión                                                                                   |
| GET    | `/dashboard/summary`           | KPIs: medidores por estado, consumo diario, anomalías, confianza, último análisis                      |
| GET    | `/meters`                      | Medidores; filtros `status`, `search`, orden `sort` (`consumption`, `variation`, `severity`) y `order` |
| GET    | `/meters/:meterId`             | Consumo actual, baseline horario, anomalías y eventos del medidor                                      |
| GET    | `/meters/:meterId/readings`    | Serie horaria de consumo, voltaje, corriente y PF (`from`, `to`)                                       |
| POST   | `/ai/analyze`                  | Run AI Analysis: lanza el análisis (202) o devuelve el que está en curso (409)                         |
| GET    | `/ai/analysis/:id` · `/latest` | Estado del análisis y de cada una de sus 7 etapas                                                      |
| GET    | `/anomalies`                   | Anomalías vigentes por prioridad; filtros `type`, `severity`, `status`, `meterId`                      |
| GET    | `/anomalies/:id`               | Investigación: explicación, pasos, evidencia, eventos e historial                                      |
| PATCH  | `/anomalies/:id`               | Acción: cambia el estado (`IN_PROGRESS`, `RESOLVED`, `DISMISSED`) con una nota                         |
| GET    | `/health`                      | Estado de la API y del LLM local                                                                       |

## Hoja de ruta

| Fase | Alcance                                                                | Estado |
| ---- | ---------------------------------------------------------------------- | ------ |
| F0   | Setup: monorepo, TypeScript, lint, tests, dev/build                    | ✅     |
| F1   | Datos: modelo, BD, migraciones, carga de CSV con validación            | ✅     |
| F2   | Motor analítico validado contra los casos del dataset                  | ✅     |
| F3   | Capa IA: explicación y recomendación sustentadas en evidencia          | ✅     |
| F4   | API completa + análisis asíncrono por etapas                           | ✅     |
| F5   | Frontend SaaS: dashboard, medidores, detalle, anomalías, investigación | ⏳     |
| F6   | Calidad: tests e2e, documentación                                      | ⏳     |
| F7   | Demo                                                                   | ⏳     |
