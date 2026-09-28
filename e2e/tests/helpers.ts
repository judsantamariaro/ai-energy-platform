import { expect, type Page } from '@playwright/test';

/** Entra con el usuario de demostración desde la pantalla de login. */
export async function loginAsDemo(page: Page) {
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Usar credenciales de demo' }).click();
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Botón Run AI Analysis de la barra superior (hay otros en los avisos de algunas pantallas). */
export const runAnalysisButton = (page: Page) =>
  page.getByRole('banner').getByRole('button', { name: 'Run AI Analysis' });

/** Lanza el análisis y espera el resultado en el panel. */
export async function runAnalysis(page: Page) {
  await runAnalysisButton(page).click();
  const panel = page.getByRole('dialog');
  await expect(
    panel.getByText('4 anomalías detectadas · 2 requieren atención prioritaria'),
  ).toBeVisible({
    timeout: 90_000,
  });
  return panel;
}
