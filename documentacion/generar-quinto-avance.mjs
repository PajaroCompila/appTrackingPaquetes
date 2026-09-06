import playwright from '../frontend/node_modules/playwright-core/index.js';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const { chromium } = playwright;
const raiz = path.resolve('documentacion/quinto_avance');
await mkdir(raiz, { recursive: true });
const navegador = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await pagina.goto('http://localhost:4200', { waitUntil: 'networkidle' });
await pagina.screenshot({ path: path.join(raiz, '01_portada.png'), fullPage: false });
await pagina.getByRole('button', { name: 'Ingresar al sistema' }).click();
await pagina.locator('#nombreUsuario').waitFor();
await pagina.screenshot({ path: path.join(raiz, '02_acceso.png'), fullPage: false });
await pagina.locator('#nombreUsuario').fill('salmacen');
await pagina.locator('#contrasena').fill('admin12345');
await pagina.getByRole('button', { name: 'Ingresar', exact: true }).click();
await pagina.getByText('Panel de operaciones').waitFor();
await pagina.screenshot({ path: path.join(raiz, '03_panel.png'), fullPage: false });

for (const [nombre, archivo, titulo] of [
  ['Usuarios', '04_usuarios.png', 'Usuarios'],
  ['Sucursales y destinos', '05_sucursales.png', 'Sucursales y destinos'],
  ['Envíos', '06_envios.png', 'Envíos'],
  ['Recepciones', '07_recepciones.png', 'Recepciones'],
]) {
  await pagina.getByRole('button', { name: new RegExp(`^${nombre}`) }).click();
  await pagina.getByRole('heading', { name: titulo, exact: true }).waitFor();
  await pagina.screenshot({ path: path.join(raiz, archivo), fullPage: false });
}

const secciones = [
  ['01_portada.png', 'Consulta de envíos', 'La portada permite consultar una guía completa o sus últimos seis dígitos.'],
  ['02_acceso.png', 'Acceso al sistema', 'El inicio de sesión se presenta sobre la portada y valida las credenciales registradas.'],
  ['03_panel.png', 'Panel de operaciones', 'El panel muestra la cuenta conectada y conserva los accesos de operación y administración.'],
  ['04_usuarios.png', 'Usuarios y sucursales', 'Cada cuenta se registra con una sucursal activa. La asignación también puede modificarse.'],
  ['05_sucursales.png', 'Sucursales y destinos', 'La pantalla permite registrar, consultar y actualizar los puntos utilizados en los envíos.'],
  ['06_envios.png', 'Gestión de envíos', 'El módulo permite registrar, consultar, editar y eliminar envíos.'],
  ['07_recepciones.png', 'Recepción de paquetes', 'Los traspasos se realizan entre usuarios registrados. El estado pasa de Registrado a En tránsito y termina en Recibido.'],
];
const imagenes = await Promise.all(secciones.map(async ([archivo]) => `data:image/png;base64,${(await readFile(path.join(raiz, archivo))).toString('base64')}`));
const paginas = secciones.map(([_, titulo, texto], indice) => `<section class="pagina"><header><span>QUINTO AVANCE</span><strong>Almacén Pájaro Azul</strong></header><div class="contenido"><h1>${titulo}</h1><p>${texto}</p><img src="${imagenes[indice]}" alt="${titulo}"></div><footer>Gixel Varela · 61551130 <b>${indice + 1}</b></footer></section>`).join('');
const documento = await navegador.newPage();
await documento.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:Letter landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#13294b}.pagina{width:11in;height:8.5in;padding:.42in .55in;page-break-after:always;background:#f3f7fd;display:flex;flex-direction:column}.pagina:last-child{page-break-after:auto}header,footer{display:flex;justify-content:space-between;align-items:center}header{padding-bottom:12px;border-bottom:2px solid #16275d}header span{font-size:10px;letter-spacing:2px;color:#2f7df6}header strong{font-size:13px}h1{font-size:25px;margin:15px 0 5px}p{font-size:12px;color:#536a82;margin:0 0 13px}.contenido{flex:1}img{display:block;width:100%;height:6.15in;object-fit:contain;object-position:top center;border:1px solid #c9d5e1;background:white}footer{padding-top:10px;font-size:10px;color:#667890}footer b{color:#2f7df6}</style></head><body>${paginas}</body></html>`, { waitUntil: 'load' });
await documento.pdf({ path: path.resolve('documentacion/quintoavance_gixelvarela_61551130.pdf'), format: 'Letter', landscape: true, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
await navegador.close();
