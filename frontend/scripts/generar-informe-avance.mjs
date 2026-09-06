import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const raiz = path.resolve('..');
const carpeta = path.join(raiz, 'documentacion', 'capturas-avance');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await mkdir(carpeta, { recursive: true });

const navegador = await chromium.launch({ executablePath: edge, headless: true });
const pagina = await navegador.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
await pagina.goto('http://localhost:4200', { waitUntil: 'networkidle' });

const capturar = async (nombre) => {
  await pagina.screenshot({ path: path.join(carpeta, `${nombre}.png`), fullPage: false });
};

await capturar('01-portal');
await pagina.getByRole('button', { name: 'Ingresar al sistema' }).click();
await pagina.waitForTimeout(500);
await capturar('02-panel');

await pagina.locator('aside').getByRole('button', { name: 'Envíos' }).click();
await pagina.waitForTimeout(900);
await pagina.addStyleTag({ content: 'app-envios p[role="alert"]{display:none!important}' });
await capturar('03-envios');

await pagina
  .locator('aside')
  .getByRole('button', { name: /Sucursales/ })
  .click();
await pagina.waitForTimeout(900);
await pagina.evaluate(() => {
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
});
await pagina.waitForTimeout(300);
await pagina.addStyleTag({ content: 'app-sucursales p[role="alert"]{display:none!important}' });
await capturar('04-sucursales');

await pagina.locator('aside').getByRole('button', { name: 'Usuarios' }).click();
await pagina.waitForTimeout(400);
await capturar('05-usuarios');
await pagina.getByRole('button', { name: 'Cerrar', exact: true }).click();

await pagina.getByRole('button', { name: 'Volver al portal' }).click();
await pagina.waitForTimeout(350);
await pagina.setViewportSize({ width: 390, height: 844 });
await capturar('06-movil');

const imagen64 = async (nombre) =>
  `data:image/png;base64,${(await readFile(path.join(carpeta, `${nombre}.png`))).toString('base64')}`;

const pantallas = [
  [
    '01-portal',
    'Consulta de paquetes',
    'La consulta de guías y el acceso al sistema conservan la imagen pública de Pájaro Azul.',
  ],
  [
    '02-panel',
    'Panel de operaciones',
    'Los accesos, textos y cuadros siguen una misma línea de alineación y separación.',
  ],
  [
    '03-envios',
    'Registro de envíos',
    'Los campos están agrupados por datos del envío, con controles y botones de medidas uniformes.',
  ],
  [
    '04-sucursales',
    'Sucursales y destinos',
    'El formulario reúne los datos necesarios para registrar o actualizar cada destino.',
  ],
  [
    '05-usuarios',
    'Creación de usuarios',
    'La ventana mantiene campos alineados y acciones de igual tamaño para completar el registro.',
  ],
  [
    '06-movil',
    'Vista en teléfonos',
    'El contenido se reorganiza para facilitar la consulta desde pantallas pequeñas.',
  ],
];

const paginas = [];
for (const [archivo, titulo, detalle] of pantallas) {
  paginas.push(
    `<section class="pagina pantalla"><header><span>ALMACÉN PÁJARO AZUL</span><b>Informe de avance</b></header><div class="titulo"><p>${titulo}</p><small>${detalle}</small></div><img src="${await imagen64(archivo)}" alt="${titulo}"><footer>30 de agosto de 2026</footer></section>`,
  );
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#17304e;background:#fff}.pagina{position:relative;width:297mm;height:210mm;padding:17mm 19mm;page-break-after:always;overflow:hidden}.pagina:last-child{page-break-after:auto}.portada{display:flex;flex-direction:column;justify-content:center;background:#e8f0ff;border-left:18mm solid #1e3a8a}.portada span,.pantalla header span{color:#2f7df6;font-size:10pt;font-weight:700;letter-spacing:1.5px}.portada h1{max-width:190mm;margin:7mm 0 4mm;font-size:31pt;line-height:1.08}.portada p{margin:0;color:#526a82;font-size:14pt}.portada footer,.pantalla footer,.resumen footer{position:absolute;right:19mm;bottom:10mm;color:#65778b;font-size:9pt}.pantalla header{display:flex;justify-content:space-between;padding-bottom:4mm;border-bottom:1px solid #c9d5e1}.pantalla header b{font-size:10pt}.titulo{display:flex;align-items:end;justify-content:space-between;gap:12mm;margin:7mm 0 5mm}.titulo p{margin:0;font-size:21pt;font-weight:700}.titulo small{max-width:145mm;color:#526a82;font-size:10pt;text-align:right}.pantalla img{display:block;width:100%;height:145mm;object-fit:contain;object-position:top center;border:1px solid #c9d5e1;background:#e8f0ff}.resumen{background:#f7f9fc}.resumen h2{margin:0 0 8mm;font-size:25pt}.resumen ul{display:grid;grid-template-columns:1fr 1fr;gap:5mm 12mm;margin:0;padding:0;list-style:none}.resumen li{padding:5mm;border-left:3px solid #2f7df6;background:#fff;font-size:12pt}.resumen li b{display:block;margin-bottom:2mm}.resumen li span{color:#526a82;font-size:10pt;line-height:1.45}
</style></head><body><section class="pagina portada"><span>ALMACÉN PÁJARO AZUL</span><h1>Avance del sistema de seguimiento de paquetes</h1><p>Resumen de las pantallas terminadas y los ajustes de presentación</p><footer>30 de agosto de 2026</footer></section>${paginas.join('')}<section class="pagina resumen"><span>TRABAJO REALIZADO</span><h2>Mejoras incorporadas</h2><ul><li><b>Orden visual</b><span>Márgenes, títulos, cuadros y botones mantienen separaciones regulares.</span></li><li><b>Consulta de guías</b><span>El portal y el panel permiten consultar paquetes por número de guía.</span></li><li><b>Registro de envíos</b><span>Los datos de origen, destino y personas se presentan en grupos claros.</span></li><li><b>Sucursales y destinos</b><span>Se incorporó el registro y la actualización de los puntos de operación.</span></li><li><b>Administración de usuarios</b><span>El formulario permite registrar cuentas y asignar el rol correspondiente.</span></li><li><b>Uso desde teléfonos</b><span>La distribución se ajusta al ancho disponible y evita cortes en el contenido.</span></li></ul><footer>Almacén Pájaro Azul · 30 de agosto de 2026</footer></section></body></html>`;

const rutaHtml = path.join(carpeta, 'informe-avance.html');
await writeFile(rutaHtml, html, 'utf8');
const reporte = await navegador.newPage();
await reporte.goto(`file:///${rutaHtml.replaceAll('\\', '/')}`, { waitUntil: 'load' });
await reporte.pdf({
  path: path.join(raiz, 'documentacion', 'Avance-front-Almacen-Pajaro-Azul.pdf'),
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});
await navegador.close();
