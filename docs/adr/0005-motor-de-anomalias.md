# ADR 0005 — Motor de anomalías: reglas estadísticas explicables

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

El motor tiene que responder, para cada medidor: qué lecturas se salen de lo esperado, si la
anomalía es real, explicable o un problema de datos, cuál investigar primero y por qué. La
evaluación premia sobre todo detectar y priorizar el caso real (M-109), no tratar como real el
caso explicado por una parada (M-106) y reconocer el problema de calidad de datos (M-112).

Antes de decidir, se midió en el dataset cuánto separa cada señal a los 8 medidores sanos de los
4 casos. Todos los umbrales dejan al menos el doble de margen sobre el ruido del peor medidor sano.

## Decisión

Un motor de **reglas estadísticas** (sin ML) en `packages/engine`: una función pura
`analyze(readings, events, { config, onStage })` que no toca la red ni la base de datos.
Se eligieron reglas porque cada conclusión se puede explicar con números concretos, el resultado
es reproducible y se puede testear, y con 14 días de datos no hay historia suficiente para
entrenar un modelo.

| Etapa       | Qué hace                                                           |
| ----------- | ------------------------------------------------------------------ |
| Lecturas    | Agrupa por medidor, ordena y calcula k = kWh / (V·I·PF / 1000)     |
| Baseline    | Mediana por hora del día sobre todo el periodo, por medidor        |
| Detección   | Incidentes de consumo e incidentes de calidad de datos             |
| Correlación | Firma eléctrica de cada incidente de consumo (PF, voltaje, k)      |
| Eventos     | Cruce con eventos, clasificación, severidad, confianza y prioridad |

### Reglas (A1–A9)

| #   | Regla                                                                                                 | Dato que la respalda                                                     |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A1  | Baseline = mediana por hora del día (los tramos anómalos son minoría en cada serie)                   | Peor sano: 17 % de desviación en 1 h                                     |
| A2  | Incidente = ≥ 3 h con \|desviación\| > 25 %, huecos ≤ 2 h, aumentos y caídas por separado             | Da 3 incidentes y 0 en los sanos                                         |
| A3  | Firma eléctrica: PF cae > 0,05, voltaje se mueve > 1,5 % (peor media móvil de 6 h), k se mueve > 15 % | Peor sano: −0,019 de PF y 0,8 % de voltaje; M-109: −0,207, −1,9 %, +27 % |
| A3  | Calidad de datos: ≥ 2 de {voltaje fuera de ±5 %, saltos > 10 V, dispersión de k > 2×}                 | Sanos: 0 / 0 / —; M-112: 16 / 32 / 2,8×                                  |
| A4  | Explican un cambio solo `OPERATIONAL_CHANGE` (aumento) y `SCHEDULED_OUTAGE` (caída con recuperación)  | `UNKNOWN` en M-109 no explica nada                                       |
| A5  | Severidad por tipo y magnitud; prioridad por rangos (ver abajo)                                       |                                                                          |
| A6  | Confianza = 0,5 + 0,49 × promedio ponderado de factores guardados en la evidencia                     |                                                                          |
| A7  | Tolerancia de ±2 h entre evento e inicio; la duración declarada solo suma evidencia                   | Los 3 eventos calzan a 0 h                                               |
| A8  | Consumo actual = últimas 24 h frente al baseline de esas horas                                        | M-109 +108 %, M-104 +45 %                                                |
| A9  | CRITICAL = anomalía real HIGH; ALERT = otro hallazgo que no sea falso positivo; OK en el resto        |                                                                          |

Una k **desplazada pero estable** (M-109: 1,06 → 1,36 con la misma dispersión) indica un cambio
eléctrico real. Una k **errática** (M-112: dispersión 2,8× mayor) indica datos inconsistentes.
Esa diferencia es la que separa los dos casos HIGH.

### Prioridad por rangos

Cada combinación tipo/severidad tiene un rango que no se solapa con los demás. Dentro del rango,
la posición depende de la magnitud (40 %), el riesgo (35 %) y la vigencia (25 %):

| Tipo y severidad        | Rango  |
| ----------------------- | ------ |
| Anomalía real HIGH      | 75–100 |
| Calidad de datos HIGH   | 60–75  |
| Anomalía real MEDIUM    | 45–60  |
| Calidad de datos MEDIUM | 35–45  |
| Anomalía explicable     | 25–35  |
| Falso positivo          | 0–20   |

Con una suma simple de puntos, una anomalía real sin cambios eléctricos podía quedar por debajo de
un problema de calidad de datos. Los rangos garantizan el orden de negocio: un consumo real sin
explicación cuesta dinero y puede ser un riesgo físico, mientras que un dato corrupto es un
problema del instrumento. Además, el puntaje que se muestra nunca contradice el orden.

## Alternativas descartadas

- **Z-score por lectura:** marca unas 150 lecturas en los medidores sanos. El problema no es la
  lectura suelta, sino el episodio.
- **Isolation Forest u otro modelo de ML:** con 14 días no hay datos para validarlo y sus
  conclusiones son difíciles de explicar.
- **Detectores de picos aislados y de patrones horarios:** se decidió no incluirlos en el MVP; el
  dataset no tiene casos de ese tipo.

## Consecuencias

- `test/dataset.test.ts` fija los 4 casos, los 8 sanos sin hallazgos y el orden de prioridad.
  Además, un test de sensibilidad mueve cada umbral ±20 % por separado y comprueba que el resultado
  no cambia.
- `test/synthetic.test.ts` prueba las reglas con series generadas: un evento fuera de tolerancia,
  una parada sin recuperación, valores faltantes, etc.
- Limitaciones conocidas:
  - El baseline usa todo el periodo. En producción debería usar una ventana móvil hacia atrás que
    excluya los incidentes abiertos.
  - Se asumen lecturas horarias.
  - La confianza es un puntaje heurístico, no una probabilidad calibrada.
  - Los umbrales salen de un solo dataset; con más medidores habría que recalibrarlos.
- Las etapas de explicación y recomendación en lenguaje natural corresponden a la capa de IA (F3),
  que parte de la evidencia estructurada de cada hallazgo.
