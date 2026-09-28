# ADR 0004 — Validación estructural en la carga y timestamps en UTC

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

La carga de `readings.csv` podría "limpiar" los datos descartando lecturas implausibles. Pero uno de
los casos del dataset (M-112) es justamente un problema de calidad de datos: consumo estable con
voltajes de 202 V y 240 V y factores de potencia repetidos. Si la carga los descartara, el motor
nunca podría detectarlo.

Además, los CSV traen timestamps sin zona horaria (`2026-09-01 00:00:00`).

## Decisión

**Validación estructural, no física.** Al cargar los datos:

| Situación                                         | Acción                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| Falta `meter_id`, fecha ilegible, texto en número | Se rechaza la fila y se informa su línea       |
| Misma clave (medidor + timestamp) repetida        | Se conserva la primera y se cuenta             |
| Campo numérico vacío                              | Se guarda `null` (dato faltante)               |
| Valor numérico implausible (202 V, PF > 1, < 0)   | Se guarda tal cual                             |
| Medidor sin metadatos en `meters.json`            | Se registra con su id como nombre y se informa |
| Tipo de evento desconocido                        | Se guarda; el motor decide si lo usa           |

**UTC fijo.** Los timestamps se interpretan como UTC y se guardan en ISO 8601
(`2026-09-01T00:00:00.000Z`). El frontend los mostrará también en UTC.

## Consecuencias

- La ingesta no toma decisiones analíticas: separa "no se puede leer" de "se lee pero es raro", y lo
  segundo queda para el motor, donde se puede explicar con evidencia.
- Con UTC, la hora que se muestra es la misma que la del CSV en cualquier navegador; por ejemplo, la
  parada de M-106 se ve a las 00:00 y no corrida por la zona horaria local.
- Si en el futuro se conociera la zona horaria real de cada medidor, habría que agregarla como
  metadato del medidor y convertir en la carga.
