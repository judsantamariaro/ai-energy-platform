import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { loginAsDemo, runAnalysis } from './helpers';

/**
 * Capturas del README (`pnpm --filter @aiem/e2e screenshots`). Usan el LLM local si está
 * disponible, así se ve la explicación redactada por el modelo.
 */
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900); // animaciones y gráficos
  await page.screenshot({ path: `${OUT}${name}.png` });
}

test('capturas de la demo', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/');
  await shot(page, '01-login');
  await loginAsDemo(page);
  await expect(page.getByText('Requieren atención', { exact: true })).toBeVisible();

  await runAnalysis(page);
  await page.waitForTimeout(3500); // revelado de las etapas
  await shot(page, '02-run-ai-analysis');
  await page.keyboard.press('Escape');

  await expect(page.getByText('M-109').first()).toBeVisible();
  await shot(page, '03-dashboard');

  await page.goto('/meters?sort=severity&order=desc');
  await shot(page, '04-medidores');

  await page.goto('/meters/M-109');
  await expect(page.getByText('Histórico horario')).toBeVisible();
  await shot(page, '05-detalle-m109');

  await page.goto('/anomalies');
  await shot(page, '06-anomalias');

  await page.getByRole('row', { name: /M-109/ }).click();
  await expect(page.getByText('Qué encontró la IA')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1500 });
  await shot(page, '07-investigacion-m109');
});
