import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const carpetaOrigen = resolve('manual-capturas');
const carpetaSalida = resolve('manual-capturas-anotadas');
await mkdir(carpetaSalida, { recursive: true });

const marcas = {
  '01-inicio-sesion': [
    [1, 870, 360], [2, 870, 458], [3, 1080, 606], [4, 30, 862],
  ],
  '02-dashboard': [
    [1, 175, 265], [2, 1087, 265], [3, 455, 445], [4, 720, 343], [5, 1020, 650],
  ],
  '03-pedidos-pendientes': [
    [1, 170, 269], [2, 1055, 350], [3, 197, 560], [4, 1193, 441], [5, 1192, 555],
  ],
  '04-pedidos-despachados': [
    [1, 155, 120], [2, 845, 233], [3, 1050, 233], [4, 1260, 233],
  ],
  '05-historial': [
    [1, 170, 270], [2, 180, 408], [3, 305, 408], [4, 1212, 516],
  ],
  '06-usuarios': [
    [1, 1288, 111], [2, 175, 255], [3, 520, 370], [4, 1095, 418],
  ],
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const [nombre, puntos] of Object.entries(marcas)) {
  const imagen = await readFile(resolve(carpetaOrigen, `${nombre}.png`));
  const url = `data:image/png;base64,${imagen.toString('base64')}`;
  const indicadores = puntos.map(([numero, x, y]) => `
    <span class="marca" style="left:${x - 17}px;top:${y - 17}px">${numero}</span>`).join('');
  await pagina.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1440px;height:900px;overflow:hidden;background:#fff}
    .lienzo{position:relative;width:1440px;height:900px}
    img{display:block;width:1440px;height:900px;object-fit:cover}
    .marca{position:absolute;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;background:#f59e0b;color:#fff;border:3px solid #fff;font:700 17px/1 "Segoe UI",Arial,sans-serif;
      box-shadow:0 2px 8px rgba(8,35,76,.45)}
  </style></head><body><div class="lienzo"><img src="${url}" alt="">${indicadores}</div></body></html>`);
  await pagina.screenshot({ path: resolve(carpetaSalida, `${nombre}.png`) });
}

await navegador.close();
console.log(`Capturas anotadas: ${Object.keys(marcas).length}`);
