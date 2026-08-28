import { writeFile } from 'node:fs/promises';

const datos = await fetch('http://127.0.0.1:9222/json').then((respuesta) => respuesta.json());
const pagina = datos.find((item) => item.type === 'page');
if (!pagina) throw new Error('No se encontró la página del navegador.');
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((resolver, rechazar) => { ws.onopen = resolver; ws.onerror = rechazar; });
let secuencia = 0;
const pendientes = new Map();
ws.onmessage = ({ data }) => {
  const mensaje = JSON.parse(data);
  if (mensaje.id && pendientes.has(mensaje.id)) {
    const { resolver, rechazar } = pendientes.get(mensaje.id); pendientes.delete(mensaje.id);
    mensaje.error ? rechazar(new Error(mensaje.error.message)) : resolver(mensaje.result);
  }
};
function llamar(method, params = {}) {
  const id = ++secuencia;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolver, rechazar) => pendientes.set(id, { resolver, rechazar }));
}
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
async function evaluar(expression) {
  return llamar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
}
async function navegar(ruta) {
  await llamar('Page.navigate', { url: `http://127.0.0.1:4400${ruta}` });
  await esperar(4500);
}
async function captura(nombre) {
  const resultado = await llamar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`documentacion/manual-capturas/${nombre}.png`, Buffer.from(resultado.data, 'base64'));
}
await llamar('Page.enable'); await llamar('Runtime.enable');
await llamar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await navegar('/login');
await captura('01-inicio-sesion');
await evaluar(`(() => { const u=document.querySelector('#nombreUsuario'); const c=document.querySelector('#contrasena');
  u.value='sistemas'; u.dispatchEvent(new Event('input',{bubbles:true}));
  c.value='123456'; c.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('form').requestSubmit(); return true; })()`);
await esperar(6000);
for (const [nombre, ruta] of [
  ['02-dashboard','/dashboard'], ['03-pedidos-pendientes','/pedidos'],
  ['04-pedidos-despachados','/pedidos-despachados'], ['05-historial','/historial-validados'],
  ['06-usuarios','/configuracion/usuarios']]) {
  await navegar(ruta); await captura(nombre);
}
ws.close();
