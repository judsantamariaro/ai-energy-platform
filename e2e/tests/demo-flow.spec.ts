import { expect, test } from '@playwright/test';
import { loginAsDemo, runAnalysis, runAnalysisButton } from './helpers';

/**
 * El flujo de la demo del enunciado, en el navegador y contra la API real:
 * Login → Dashboard → M-109 → Run AI Analysis → Anomalía → Explicación → Acción.
 * Los tests comparten la base de datos, así que corren en orden.
 */
test.describe.configure({ mode: 'serial' });

test('sin sesión, una ruta protegida lleva al login y vuelve a ella después de entrar', async ({
  page,
}) => {
  await page.goto('/anomalies');
  await loginAsDemo(page);

  await expect(page).toHaveURL(/\/anomalies$/);
  await expect(page.getByRole('heading', { name: 'Anomalías IA' })).toBeVisible();
  await expect(page.getByText('Aún no hay anomalías')).toBeVisible();
});

test('flujo de la demo: Dashboard → M-109 → Run AI Analysis → Anomalía → Explicación → Acción', async ({
  page,
}) => {
  await page.goto('/');
  await loginAsDemo(page);

  // Dashboard antes del análisis: invita a ejecutarlo.
  await expect(
    page.getByText('Ejecuta el análisis IA para saber qué requiere atención'),
  ).toBeVisible();

  // Medidores → M-109, todavía sin baseline.
  await page.getByRole('link', { name: 'Medidores' }).click();
  await page.getByPlaceholder('Buscar por meter_id o nombre').fill('M-109');
  await page.getByRole('row', { name: /M-109/ }).click();
  await expect(page).toHaveURL(/\/meters\/M-109$/);
  await expect(
    page.getByText('El baseline y las anomalías se calculan al ejecutar el análisis IA.'),
  ).toBeVisible();

  // Run AI Analysis: las 7 etapas y el resultado del enunciado.
  const panel = await runAnalysis(page);
  for (const stage of [
    'Lecturas',
    'Baseline',
    'Detección',
    'Correlación',
    'Eventos',
    'Explicación',
    'Recomendación',
  ]) {
    await expect(panel.getByText(stage, { exact: true })).toBeVisible();
  }
  await expect(
    panel.getByText('4 explicaciones generadas con plantillas (sin LLM local disponible).'),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // El detalle de M-109 ya muestra el estado y la variación frente al baseline.
  await expect(page.getByText('Crítico').first()).toBeVisible();
  await expect(page.getByText('+108,3 %')).toBeVisible();

  // Anomalía → Explicación.
  await page.getByRole('link', { name: 'Investigar anomalía' }).click();
  await expect(page).toHaveURL(/\/anomalies\/[\w-]+$/);
  await expect(
    page.getByText(
      'Consumo +107,9 % por encima del baseline sin evento que lo explique y con cambios eléctricos.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Anomalía real').first()).toBeVisible();
  await expect(
    page.getByText('Generado con plantilla a partir de la evidencia del motor'),
  ).toBeVisible();
  await expect(page.getByText('Investigar medidor e instalación').first()).toBeVisible();
  await expect(page.getByText('UNKNOWN', { exact: true })).toBeVisible();
  await expect(page.getByText('No explica el cambio', { exact: true })).toBeVisible();

  // Acción: se registra en el historial con la nota.
  await page
    .getByPlaceholder('Nota (opcional): qué se hizo o qué se encontró')
    .fill('Cuadrilla enviada a la planta');
  await page.getByRole('button', { name: 'Iniciar investigación' }).click();
  await expect(page.getByText('Cuadrilla enviada a la planta')).toBeVisible();
  await page.getByRole('button', { name: 'Resolver', exact: true }).click();
  await expect(page.getByText('Estado actual:').getByText('Resuelta')).toBeVisible();
});

test('las anomalías quedan priorizadas y resolver M-109 lo saca de estado crítico', async ({
  page,
}) => {
  await page.goto('/anomalies');
  await loginAsDemo(page);

  const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows).toHaveCount(4);
  const meters = await rows.locator('td:nth-child(2) a').allInnerTexts();
  expect(meters).toEqual(['M-109', 'M-112', 'M-104', 'M-106']);
  await expect(rows.nth(0)).toContainText('Resuelta');
  await expect(rows.nth(3)).toContainText('Falso positivo');
  await expect(rows.nth(3)).toContainText('Descartada');

  await page.getByRole('link', { name: 'Medidores' }).click();
  await page.getByRole('radio', { name: /Críticos/ }).click();
  await expect(page.getByText('Ningún medidor coincide con los filtros')).toBeVisible();
  await page.getByRole('radio', { name: /Alertas/ }).click();
  await expect(page.getByRole('row', { name: /M-112/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /M-104/ })).toBeVisible();
});

test('un segundo análisis conserva lo que hizo el usuario', async ({ page }) => {
  await page.goto('/');
  await loginAsDemo(page);
  await runAnalysis(page);
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: /Anomalías IA/ }).click();
  await expect(page.getByRole('row', { name: /M-109/ })).toContainText('Resuelta');
  await expect(runAnalysisButton(page)).toBeEnabled();
});
