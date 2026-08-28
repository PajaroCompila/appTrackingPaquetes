import { test } from '@playwright/test';

test('capturas reales para el manual', async ({ page }) => {
  await page.goto('http://127.0.0.1:4400/login');
  await page.screenshot({ path: 'manual-capturas/01-inicio-sesion.png' });
  await page.locator('#nombreUsuario').fill('sistemas');
  await page.locator('#contrasena').fill('123456');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/(pedidos|dashboard)/, { timeout: 20000 });
  for (const [nombre, ruta] of [
    ['02-dashboard', '/dashboard'], ['03-pedidos-pendientes', '/pedidos'],
    ['04-pedidos-despachados', '/pedidos-despachados'], ['05-historial', '/historial-validados'],
    ['06-usuarios', '/configuracion/usuarios'],
  ]) {
    await page.goto(`http://127.0.0.1:4400${ruta}`);
    await page.waitForTimeout(5500);
    await page.screenshot({ path: `manual-capturas/${nombre}.png` });
  }
});
