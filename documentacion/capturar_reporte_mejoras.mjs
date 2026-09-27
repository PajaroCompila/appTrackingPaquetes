import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const usuario = process.env.PEDIDOS_USUARIO;
const clave = process.env.PEDIDOS_CLAVE;
if (!usuario || !clave) throw new Error('Faltan PEDIDOS_USUARIO y PEDIDOS_CLAVE.');

const base = 'http://127.0.0.1:4400';
const salida = resolve('reporte-mejoras-capturas');
await mkdir(salida, { recursive: true });

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
});
const pagina = await contexto.newPage();

async function esperarPantalla() {
  await pagina.waitForLoadState('domcontentloaded');
  await pagina.waitForTimeout(1400);
}

async function limpiarMarcas() {
  await pagina.locator('[data-marca-reporte]').evaluateAll((nodos) => nodos.forEach((nodo) => nodo.remove()));
}

async function marcar(selector, numero, posicion = 'superior-derecha') {
  const elemento = pagina.locator(selector).first();
  if (!(await elemento.count()) || !(await elemento.isVisible())) return;
  const caja = await elemento.boundingBox();
  if (!caja) return;
  const puntos = {
    'superior-izquierda': [caja.x + 10, caja.y + 10],
    'superior-derecha': [caja.x + caja.width - 10, caja.y + 10],
    'centro-derecha': [caja.x + caja.width - 10, caja.y + caja.height / 2],
  };
  const [x, y] = puntos[posicion] ?? puntos['superior-derecha'];
  await pagina.evaluate(({ x, y, numero }) => {
    const marca = document.createElement('div');
    marca.dataset.marcaReporte = '1';
    marca.textContent = String(numero);
    Object.assign(marca.style, {
      position: 'fixed', left: `${x - 17}px`, top: `${y - 17}px`, width: '34px', height: '34px',
      display: 'grid', placeItems: 'center', zIndex: '2147483647', borderRadius: '50%',
      border: '3px solid #fff', background: '#f59e0b', color: '#fff',
      font: '700 17px/1 Segoe UI, Arial, sans-serif', boxShadow: '0 2px 9px rgba(8,35,76,.48)',
      pointerEvents: 'none',
    });
    document.body.appendChild(marca);
  }, { x, y, numero });
}

async function capturar(nombre, marcas = []) {
  await limpiarMarcas();
  for (const marca of marcas) await marcar(...marca);
  await pagina.screenshot({ path: resolve(salida, `${nombre}.png`), fullPage: false });
  await limpiarMarcas();
}

await pagina.goto(`${base}/login`, { waitUntil: 'networkidle' });
await capturar('01-login', [
  ['.panel-botanico', 1, 'superior-izquierda'],
  ['#nombreUsuario', 2],
  ['#contrasena', 3],
  ['button[type="submit"]', 4],
]);

await pagina.locator('#nombreUsuario').fill(usuario);
await pagina.locator('#contrasena').fill(clave);
await Promise.all([
  pagina.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20000 }),
  pagina.locator('button[type="submit"]').click(),
]);
await esperarPantalla();

await pagina.goto(`${base}/prueba-microinteracciones`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
await pagina.locator('.tarjeta-clickeable').first().hover();
await capturar('02-microinteracciones', [
  ['.botones-prueba', 1],
  ['.tarjetas-prueba', 2],
  ['.tabla-prueba', 3],
  ['button:has-text("Abrir modal")', 4],
]);

await pagina.goto(`${base}/pedidos`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
const selectorAlmacenes = pagina.locator('details.selector-multiple').first();
await selectorAlmacenes.locator('summary').click();
await pagina.locator('.opcion-almacen input').first().waitFor({ state: 'visible', timeout: 15000 });
const codigosPreferidos = ['BSPS03', 'TSPS01'];
let seleccionados = 0;
for (const codigo of codigosPreferidos) {
  const casilla = pagina.locator(`.opcion-almacen:has-text("${codigo}") input`).first();
  if (await casilla.count()) { await casilla.check(); seleccionados += 1; }
}
if (seleccionados === 0) {
  const casillas = pagina.locator('.opcion-almacen input');
  const cantidadCasillas = await casillas.count();
  for (let indice = 0; indice < Math.min(2, cantidadCasillas); indice += 1) await casillas.nth(indice).check();
}
await selectorAlmacenes.locator('summary').click();
await pagina.locator('.acciones-filtros .boton-primario').click();
await pagina.waitForTimeout(1800);
await capturar('03-pedidos-filtros', [
  ['details.selector-multiple summary', 1],
  ['.etiquetas-almacenes', 2],
  ['.acciones-filtros .boton-primario', 3],
  ['.tabla-contenedor', 4, 'superior-izquierda'],
]);

await pagina.goto(`${base}/pedidos-despachados`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
await pagina.locator('tbody tr').first().hover().catch(() => {});
await capturar('04-despachados-filtros', [
  ['details.selector-multiple summary', 1],
  ['.etiquetas-almacenes', 2],
  ['.acciones-filtros .boton-primario', 3],
  ['.tabla-contenedor', 4, 'superior-izquierda'],
]);

await pagina.goto(`${base}/historial-validados`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
await pagina.locator('text=Cargando historial').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
await capturar('05-historial-pedidos', [
  ['details.selector-multiple summary', 1],
  ['.etiquetas-almacenes', 2],
  ['.pestanas-historial', 3],
  ['.tabla-contenedor', 4, 'superior-izquierda'],
]);

const pestanaArticulos = pagina.locator('#pestana-articulos');
await pestanaArticulos.click();
await pagina.waitForTimeout(700);
await capturar('06-historial-articulos', [
  ['#pestana-articulos', 1],
  ['.tabla-articulos', 2, 'superior-izquierda'],
  ['.codigo-articulo', 3],
  ['.tabla-articulos tbody tr td:nth-child(3)', 4],
]);

await pagina.goto(`${base}/pedidos`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
await pagina.locator('.codigo-consultable').first().dblclick().catch(() => {});
await pagina.locator('.dialogo-inventario').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
await pagina.locator('.estado-dialogo').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => {});
await capturar('07-inventario-articulo', [
  ['#titulo-inventario', 1],
  ['.datos-inventario', 2, 'superior-izquierda'],
  ['.resumen-dashboard', 3],
  ['.bodegas-inventario', 4, 'superior-izquierda'],
]);

await pagina.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
await pagina.locator('text=Cargando pedidos').waitFor({ state: 'hidden', timeout: 35000 }).catch(() => {});
await capturar('08-dashboard', [
  ['.filtros-dashboard', 1],
  ['.tarjetas', 2, 'superior-izquierda'],
  ['.tarjetas-sucursales', 3, 'superior-izquierda'],
]);

await pagina.goto(`${base}/configuracion/usuarios`, { waitUntil: 'domcontentloaded' });
await esperarPantalla();
await pagina.locator('tbody tr').first().hover().catch(() => {});
await capturar('09-usuarios', [
  ['button:has-text("Crear usuario")', 1],
  ['form.filtros', 2, 'superior-izquierda'],
  ['.tabla-contenedor', 3, 'superior-izquierda'],
  ['tbody tr:first-child .acciones', 4],
]);

await navegador.close();
console.log(`Capturas creadas en ${salida}`);
