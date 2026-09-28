# ADR 0003 — SQLite + Drizzle ORM para la persistencia

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

El volumen es pequeño (4.032 lecturas, 12 medidores) y el evaluador tiene que poder levantar el
proyecto sin instalar servicios. No hay Docker disponible en el entorno de desarrollo.

## Opciones

- **PostgreSQL**: más cercano a producción, pero exige instalarlo o usar Docker.
- **SQLite + Prisma**: más pesado (motor binario aparte y generación de cliente).
- **SQLite + Drizzle**: un solo archivo, sin servidor, consultas tipadas desde TypeScript y
  migraciones versionadas.

## Decisión

SQLite con Drizzle ORM. La base se regenera desde `data/*.csv` con una carga idempotente, así que
el archivo `.db` no se versiona.

## Consecuencias

- El acceso a datos queda detrás de repositorios, así que migrar a PostgreSQL sería cambiar el
  driver y el dialecto de Drizzle, no la lógica.
- Driver: `better-sqlite3`. Es maduro y la versión 13 trae binarios precompilados dentro del paquete,
  así que no necesita compilar nada (en `pnpm-workspace.yaml` su script de build está en
  `ignoredBuiltDependencies`). `node:sqlite` viene incluido en Node, pero todavía es experimental.
- Las migraciones SQL las genera `drizzle-kit` (`pnpm --filter @aiem/api db:generate`), se versionan
  en `apps/api/drizzle/` y se aplican solas al abrir la base.
