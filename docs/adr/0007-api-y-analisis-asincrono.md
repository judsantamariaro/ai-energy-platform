# ADR 0007 — API: análisis asíncrono por etapas, anomalías persistentes y sesión por cookie

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

La API une el motor (ADR 0005) y la capa de IA (ADR 0006) con la interfaz. El flujo de la demo es
Login → Dashboard → M-109 → Run AI Analysis → Anomalía → Explicación → Acción, y el análisis con LLM
tarda unos 25 s, así que no puede resolverse dentro de una sola petición HTTP.

## Decisiones

| #    | Decisión                                                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-a | `POST /ai/analyze` crea el análisis y responde 202; se ejecuta en segundo plano y guarda el avance de cada etapa. La UI consulta `GET /ai/analysis/:id`. Los tiempos son reales, sin demoras artificiales. Si ya hay uno en curso, responde 409 con ese análisis.                                                                   |
| F4-b | La "Acción" es un cambio de estado de la anomalía (`OPEN → IN_PROGRESS → RESOLVED`, o `DISMISSED`) que queda en un historial con nota, fecha y usuario. Los falsos positivos nacen `DISMISSED` con una acción del sistema.                                                                                                          |
| F4-c | Una anomalía se identifica por la clave determinista del motor. Si un análisis nuevo vuelve a encontrarla, actualiza la misma fila: conserva id, estado e historial. Si el usuario la había cerrado y ahora es más grave, se reabre con una acción del sistema que lo explica. Las vigentes son las del último análisis completado. |
| F4-d | Usuario de demostración precargado; contraseña con `scrypt`; sesión en una cookie `httpOnly` firmada con HMAC. Todas las rutas salvo `/health`, `/auth/login` y `/docs` exigen sesión.                                                                                                                                              |
| F4-e | Al arrancar no se ejecuta ningún análisis: el dashboard invita a correr Run AI Analysis.                                                                                                                                                                                                                                            |
| F4-f | `LLM_PROVIDER=auto`: en cada análisis se comprueba si Ollama responde y tiene el modelo, y al arrancar se precarga. Sin Ollama se usan las plantillas.                                                                                                                                                                              |

Además:

- **Contratos:** los esquemas zod de `@aiem/shared` validan la entrada y la salida de cada ruta
  (`fastify-type-provider-zod`) y generan la documentación OpenAPI en `/docs`.
- **Estado del medidor:** se recalcula con la regla del motor (A9) a partir de las anomalías
  vigentes que siguen activas. Resolver la anomalía de M-109 lo saca de CRITICAL.
- **Arranque:** un análisis que quedó a medias por un reinicio se marca como fallido.
- **Robustez del análisis:** cualquier error queda registrado como análisis fallido, con la etapa
  que falló, sin tumbar el proceso. La última etapa se marca en la misma transacción que completa
  el análisis.
- **Login:** `scrypt` asíncrono (no bloquea otras peticiones), el mismo tiempo de respuesta exista
  o no el correo, 10 intentos por minuto por IP (`@fastify/rate-limit`) y cookie `Secure` con
  `COOKIE_SECURE=true` al desplegar detrás de HTTPS.

## Consecuencias

- El análisis vive en el mismo proceso que la API: si la API se reinicia a mitad de un análisis,
  hay que volver a lanzarlo. Para un MVP con un solo usuario es suficiente; con más carga iría a una
  cola de trabajos.
- La sesión es sin estado en el servidor: no se puede revocar una sesión antes de que expire, salvo
  cambiando `SESSION_SECRET`.
- `anomalies.analysis_run_id` apunta al último análisis que detectó la anomalía; el historial
  completo de cada análisis queda en `analysis_runs` (resumen, etapas y resumen por medidor).
