# ADR 0006 — Capa de IA: plantillas siempre, LLM local opcional (Ollama + Qwen 2.5 3B)

- Estado: aceptada
- Fecha: 2026-09-27

## Contexto

El motor (ADR 0005) ya detecta, clasifica y prioriza sin ningún LLM. Falta convertir su evidencia
en una explicación y una recomendación que una persona entienda en segundos. Restricciones:

- No usar un LLM de pago: el repo se comparte y el evaluador no tendría una API key.
- La app tiene que funcionar completa sin instalar nada extra.
- Un texto incorrecto en la demo (sobre todo en M-109) es peor que un texto sobrio.

## Decisión

Paquete `@aiem/ai` con dos formas de generar el texto:

| Parte del texto              | Quién la genera                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frase corta (`reason`)       | Siempre reglas (plantilla)                                                                                                 |
| Acción principal             | Siempre reglas, según el tipo: Investigar medidor e instalación / Validar medidor y datos / Validar operación / No escalar |
| Explicación y pasos a seguir | LLM local si está configurado y su respuesta pasa los controles; si no, la plantilla                                       |

**Proveedor:** [Ollama](https://ollama.com) con **Qwen 2.5 3B**: libre, local y sin API key.
Cabe entero en una GPU de 4 GB.

**Cómo se le pide el texto al modelo:** no recibe la evidencia en JSON (con eso un modelo chico
mezclaba nombres de campos, ids y fechas ISO), sino la explicación de la plantilla como "hechos
verificados", para que la reescriba y la enriquezca. Además recibe reglas explícitas: no afirmar
causas desconocidas, no usar ids ni fechas técnicas, y que la confianza es la de la clasificación.
Salida estructurada con esquema JSON, `temperature` 0,2 y `keep_alive` de 30 min.

**Controles antes de aceptar una respuesta** (si falla alguno, se usa la plantilla y se guarda el
motivo):

1. Esquema: explicación de 40 a 1200 caracteres y de 1 a 5 pasos.
2. Números: todo número del texto debe estar en lo que vio el modelo (con redondeo, en % o como
   parte de una fecha), con una tolerancia del 0,1 %: se aceptan redondeos, no aproximaciones.
   Los enteros hasta 10 pasan libres ("3 pasos"), salvo que sean porcentajes. Así se detectó, por
   ejemplo, un año inventado.
3. Contenido: sin fechas ISO, ids internos ni nombres de campos o señales. En anomalías reales y en
   calidad de datos, sin afirmaciones de causa ("se debe a", "causado por"). En falsos positivos, sin
   pasos que propongan escalar o avisar.

Cada regla de contenido corresponde a un error real observado al comparar modelos.

## Selección del modelo

`pnpm --filter @aiem/ai compare-models <modelos>` corre los 4 hallazgos reales por cada modelo y
muestra el tiempo, si la respuesta pasó los controles y el texto. Resultados en una GTX 1650 (4 GB):

| Iteración                                     | Qwen 2.5 3B                              | Llama 3.2 3B                                  |
| --------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| 1. Prompt con evidencia en JSON               | 4/4, pero con causas inventadas en M-109 | 4/4, con ids, fechas ISO y frases sin sentido |
| 2. Prompt con hechos + controles de contenido | 3/4 (año inventado en M-112)             | 3/4 y 4/4                                     |
| 3. Con el año del dataset en el prompt        | **4/4 · ~5 s por hallazgo**              | 2/4 (afirma causas)                           |

Se eligió Qwen 2.5 3B por la calidad del español, porque respeta la estructura pedida y por la
velocidad. La primera carga del modelo tarda entre 15 s y 80 s; después queda en memoria.

## Alternativas descartadas

- **Claude u otra API de pago:** requiere una API key que no se puede compartir en el repo.
- **APIs gratuitas en la nube (Gemini, Groq):** tampoco son de código abierto y también exigen key.
- **Solo plantillas:** es la base y siempre funciona, pero en la demo no se ve la IA redactando.
- **Qwen 2.5 7B:** redactaría mejor, pero no cabe en 4 GB de VRAM y sería bastante más lento.

## Consecuencias

- Sin Ollama, la app funciona igual con las plantillas; la interfaz indica de dónde salió cada
  texto (`source` = `TEMPLATE` o `LLM`, y el modelo).
- Un modelo de 3B puede fallar en alguna corrida: en ese caso se muestra la plantilla y queda
  registrado el motivo en `fallbackReason`.
- Los controles no garantizan que el texto sea brillante, solo que no contradiga la evidencia.
  Tampoco revisan el sentido de un cambio: "cayó 27 %" cuando subió pasaría el control de números
  (la cifra existe); lo mitiga que el modelo reescribe una explicación base ya correcta.
- Con Ollama, la explicación de 4 hallazgos agrega unos 20 s al análisis. Por eso los textos se
  generan una sola vez por análisis y se guardan (F4).
