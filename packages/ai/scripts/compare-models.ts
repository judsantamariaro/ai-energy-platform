/**
 * Compara modelos de Ollama sobre los hallazgos reales del dataset: tiempo de respuesta, si la
 * respuesta pasa la validación (esquema + números sustentados) y el texto generado.
 *
 * Uso: pnpm --filter @aiem/ai compare-models qwen2.5:3b llama3.2:3b
 */
import { analyze } from '@aiem/engine';
import { loadEvents, loadReadings } from '../../engine/test/dataset.js';
import { generateInsight } from '../src/insights.js';
import { createOllamaProvider } from '../src/ollama.js';

const models = process.argv.slice(2);
if (models.length === 0) {
  console.error('Indica al menos un modelo: compare-models qwen2.5:3b llama3.2:3b');
  process.exit(1);
}

const baseUrl = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const { findings } = analyze(loadReadings(), loadEvents());

for (const model of models) {
  const provider = createOllamaProvider({ baseUrl, model, timeoutMs: 180_000 });
  console.log(`\n${'='.repeat(80)}\n${model}\n${'='.repeat(80)}`);

  // La primera llamada carga el modelo en memoria: se descarta para no ensuciar los tiempos.
  const warmStart = performance.now();
  await generateInsight(findings[0]!, { provider });
  console.log(
    `Carga del modelo + primera respuesta: ${((performance.now() - warmStart) / 1000).toFixed(1)} s`,
  );

  let accepted = 0;
  let totalSeconds = 0;
  for (const finding of findings) {
    const start = performance.now();
    const insight = await generateInsight(finding, { provider });
    const seconds = (performance.now() - start) / 1000;
    totalSeconds += seconds;
    if (insight.source === 'LLM') accepted++;

    console.log(
      `\n--- ${finding.meterId} · ${finding.type} · ${seconds.toFixed(1)} s · ${insight.source}`,
    );
    if (insight.fallbackReason) console.log(`    ✗ ${insight.fallbackReason}`);
    console.log(`    ${insight.explanation}`);
    insight.steps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  }

  console.log(
    `\nResumen ${model}: ${accepted}/${findings.length} respuestas aceptadas · ` +
      `${(totalSeconds / findings.length).toFixed(1)} s por hallazgo · ${totalSeconds.toFixed(1)} s en total`,
  );
}
