# ADR 0008 — Frontend: React + shadcn/ui + ECharts, datos con TanStack Query

- Estado: aceptada
- Fecha: 2026-09-28

## Contexto

La interfaz tiene que sentirse como un producto SaaS de gestión energética y hacer evidente, en
pocos minutos, qué aporta la IA: qué medidor requiere atención, por qué y qué hacer. Flujo de la
demo: Login → Dashboard → M-109 → Run AI Analysis → Anomalía → Explicación → Acción.

## Decisiones

| #    | Decisión                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F5-a | **Tailwind + shadcn/ui** (Radix): componentes accesibles cuyo código vive en el repo. Paleta propia con colores semánticos del dominio (crítico, alerta, normal, info).                                             |
| F5-b | **ECharts** para las series horarias: zoom, zona sombreada con la ventana de la anomalía, baseline superpuesto y eventos como líneas verticales. Solo se importan los módulos usados.                               |
| F5-c | **React Router + TanStack Query.** El análisis en curso se consulta cada segundo; al terminar se refrescan dashboard, medidores y anomalías.                                                                        |
| F5-d | Nombre de producto neutro en una sola constante (`src/brand.ts`); no se usa la marca de la empresa.                                                                                                                 |
| F5-e | Menú lateral: Dashboard · Medidores · Anomalías IA. **Run AI Analysis** en la barra superior, visible desde cualquier pantalla, abre un panel con las 7 etapas. La Investigación sigue la sección 12 del enunciado. |
| F5-f | Tema claro, pensado para escritorio.                                                                                                                                                                                |
| F5-g | Vitest + Testing Library para formato, insignias y login; el flujo completo va en los tests e2e (F6).                                                                                                               |

Detalles:

- **Fechas en UTC** en toda la interfaz (etiquetas y marcas del eje, `useUTC` de ECharts), igual
  que en los datos (ADR 0004).
- **Etapas del análisis:** las del motor terminan en milisegundos, así que el panel las revela de a
  una (450 ms). Los tiempos que muestra son los reales; la de explicación con el LLM tarda ~20 s.
- **Filtros en la URL** (medidores y anomalías): se pueden compartir y sobreviven a recargar la página.
- **Origen del texto visible:** la Investigación indica si la explicación la redactó el LLM local o
  la plantilla, y por qué se usó la plantilla si hubo un fallo.
- **Carga por ruta:** cada pantalla se descarga al visitarla. ECharts (~590 kB) solo se carga en
  las pantallas con gráficos, y el bundle inicial no incluye zod (las constantes que usa el
  frontend están en `@aiem/shared/constants`).

## Consecuencias

- La paleta de los gráficos se repite en hexadecimal (`charts/palette.ts`), porque ECharts no
  interpreta los colores `oklch` del tema.
- Sin modo oscuro ni diseño móvil completo: el caso de uso es un analista frente a un escritorio.
