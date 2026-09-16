import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { construirEntregasSap, EntregaSapFuente, type FilaEntregaSap, type FilaFacturaEntregaSap } from './entregaSapFuente.js';
import { EntregaSapRepositorio, proyectarEntregaSap, type ControlEntregasSap } from './entregaSapRepositorio.js';
import { EntregaSapSincronizador } from './entregaSapSincronizador.js';
import { HistorialServicio } from './historialServicio.js';
import { crearHistorialRutas } from './historialRutas.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type { EntregaSapPersistida } from './entregaSap.interface.js';

const consultas = vi.hoisted(() => vi.fn());
vi.mock('../../infraestructura/sql/consultaSap.js', () => ({ consultarSap: consultas }));
vi.mock('../../infraestructura/sql/conexionSap.js', () => ({ obtenerPoolSap: vi.fn().mockResolvedValue({}) }));

const fecha = new Date('2026-09-14T00:00:00Z');
const fila = (cambios: Partial<FilaEntregaSap> = {}): FilaEntregaSap => ({
  docEntry: 6669, docNum: 40968, docDate: fecha, docTime: 902, createDate: fecha, createTS: 90201,
  updateDate: fecha, updateTS: 90202, canceled: 'N', docStatus: 'O', nombreVendedor: 'SPS Hector Alvi Cedillo',
  referenciaR1: 'SPSS04CO60265', userSign: 55, usuarioRegistrador: 'PIERROT', nombreRegistrador: 'Usuario SAP',
  lineNum: 0, itemCode: 'YAM-MODX7', descripcion: 'Sintetizador', quantity: 1, invQty: 1,
  whsCode: 'TSPS01', nombreAlmacen: 'Tienda Principal', baseType: 23, baseEntry: 160052,
  baseLine: 2, numeroBase: 100206148, ...cambios,
});
const factura: FilaFacturaEntregaSap = { entregaDocEntry: 6669, docEntry: 900000,
  docNum: 201646999, baseLine: 0, cantidad: 1 };
const entrega = (cambios: Partial<FilaEntregaSap> = {}, facturas: FilaFacturaEntregaSap[] = []) =>
  construirEntregasSap([fila(cambios)], [{ docEntry: cambios.docEntry ?? 6669,
    lineNum: cambios.lineNum ?? 0, itemCode: cambios.itemCode ?? 'YAM-MODX7', whsCode: cambios.whsCode ?? 'TSPS01',
    salida: cambios.invQty ?? 1 }], facturas)[0]!;

describe('Entregas SAP: hechos documentales y proyección protegida', () => {
  it('registra entrega abierta con salida, sin exigir cierre ni factura', () => {
    const e = entrega();
    expect(e.docStatus).toBe('O');
    expect(e.estadoLogistico).toBe('SALIDA_COMPROBADA');
    expect(e.estadoFinanciero).toBe('Entregado, Sin factura');
    expect(e.idOrigen).toBe('SAP:PAJARO_AZUL:15:6669');
    expect(e.fechaEntrega).toBe('2026-09-14T09:02:01');
  });
  it('identifica factura solo por entrega y BaseLine real', () => {
    expect(entrega({}, [factura]).estadoFinanciero).toBe('Facturado');
    expect(entrega({}, [{ ...factura, entregaDocEntry: 961461 }]).estadoFinanciero).toBe('Entregado, Sin factura');
    expect(entrega({}, [{ ...factura, baseLine: 2 }]).estadoFinanciero).toBe('Entregado, Sin factura');
  });
  it('conserva cotización y no inventa ORDR 961461 / 101475685', () => {
    const p = proyectarEntregaSap(entrega(), fecha);
    expect(p.entregaSap?.tipo).toBe('Entrega desde cotización');
    expect(p.entregaSap?.bases).toEqual([{ baseType: 23, baseEntry: 160052, baseLine: 2, numeroDocumento: '100206148' }]);
    expect(JSON.stringify(p)).not.toContain('101475685');
    expect(JSON.stringify(p)).not.toContain('961461');
    expect(p.responsablesAsignados).toEqual([]);
    expect(p.articulos[0]?.usuarioAsignado).toBeNull();
  });
  it('representa entrega 4432 sin base sin inventar pedido', () => {
    const e = entrega({ docEntry: 4432, docNum: 200016780, baseType: -1, baseEntry: -1, baseLine: -1, numeroBase: null });
    const p = proyectarEntregaSap(e, fecha);
    expect(p.entregaSap?.tipo).toBe('Entrega sin documento base');
    expect(p.entregaSap?.bases[0]?.baseEntry).toBeNull();
    expect(p.numeroPedido).toBe('200016780');
  });
  it('ADMINISTRADOR ve PIERROT solamente mientras no hay factura', () => {
    expect(proyectarEntregaSap(entrega(), fecha, 'ADMINISTRADOR').auditoriaSap?.usuarioRegistrador).toBe('PIERROT');
    expect(proyectarEntregaSap(entrega({}, [factura]), fecha, 'ADMINISTRADOR')).not.toHaveProperty('auditoriaSap');
  });
  it.each(['OPERADOR_BODEGA', 'CONSULTA', undefined])('no expone auditoría a %s', rol => {
    const json = JSON.stringify(proyectarEntregaSap(entrega(), fecha, rol));
    expect(json).not.toMatch(/PIERROT|UserSign|userSign|usuarioRegistrador|nombreRegistrador/);
  });
  it('no da por entregado un cancelado aunque tenga movimiento', () => {
    expect(entrega({ canceled: 'Y' }).estadoLogistico).toBe('CANCELADA');
    expect(entrega({ canceled: 'C' }).estadoLogistico).toBe('CANCELADA');
  });
  it('no prueba salida con otro almacén o artículo ni con una factura sola', () => {
    const e = construirEntregasSap([fila()], [{ docEntry: 6669, lineNum: 0,
      itemCode: 'YAM-MODX7', whsCode: 'BSPS03', salida: 1 }], [factura])[0]!;
    expect(e.estadoLogistico).toBe('SIN_SALIDA');
    expect(proyectarEntregaSap(e,fecha).articulos).toEqual([]);
  });
  it('mantiene cobertura por BaseLine e InvQty, sin afirmar entrega completa del pedido', () => {
    const e = construirEntregasSap([fila({ baseType: 17, baseEntry: 919780, baseLine: 3,
      numeroBase: 101459807, quantity: 2, invQty: 20 })], [{ docEntry: 6669, lineNum: 0,
      itemCode: 'YAM-MODX7', whsCode: 'TSPS01', salida: 10 }], [])[0]!;
    expect(e.lineas[0]?.cantidadEntregada).toBe(1);
    expect(e.lineas[0]?.invQty).toBe(20);
    expect(e.lineas[0]?.baseLine).toBe(3);
    expect(proyectarEntregaSap(e, fecha).articulos[0]?.cantidad).toBe(1);
  });
  it('dos entregas del mismo pedido conservan identidades distintas por documento', () => {
    const filas = [fila({docEntry:7000,baseType:17,baseEntry:919780,baseLine:3,numeroBase:101459807}),
      fila({docEntry:7001,baseType:17,baseEntry:919780,baseLine:3,numeroBase:101459807})];
    const entregas = construirEntregasSap(filas,[7000,7001].map(docEntry => ({docEntry,lineNum:0,
      itemCode:'YAM-MODX7',whsCode:'TSPS01',salida:1})),[]);
    expect(entregas.map(e => e.idOrigen)).toEqual(['SAP:PAJARO_AZUL:15:7000','SAP:PAJARO_AZUL:15:7001']);
    expect(entregas.every(e => e.lineas[0]?.baseEntry === 919780)).toBe(true);
  });
  it('todas las consultas SAP son SELECT por lote; OIVL es la única evidencia de inventario', async () => {
    const textos: string[] = [];
    consultas.mockImplementation(async (texto: string) => {
      validarConsultaSistemaOrigen(texto); textos.push(texto); return { recordset: [] };
    });
    const fuente = new EntregaSapFuente();
    await fuente.descubrir(0); await fuente.descubrir(6669,25,true); await fuente.descubrirFacturas(881777);
    await fuente.obtener([6669,6618,4432]);
    expect(textos).toHaveLength(6);
    expect(textos.join('\n')).not.toContain('OINM');
    expect(textos.join('\n')).toContain("f.CANCELED = 'N'");
    expect(textos.join('\n')).not.toContain("DocStatus = 'C'");
    expect(textos.join('\n')).toContain('BaseType = 15');
    expect(textos.join('\n')).toContain('118');
  });
});

describe('Sincronización incremental e idempotencia', () => {
  const preparar = () => {
    let control: ControlEntregasSap = { ultimoDocEntry: 0, anteriorDocEntry: 0, revisionDocEntry: 0, ultimaFacturaDocEntry: 0 };
    let actual = entrega();
    const guardadas = new Map<string, EntregaSapPersistida>();
    const guardar = vi.fn(async (lote: EntregaSapPersistida[], nuevo?: ControlEntregasSap) => {
      lote.forEach(e => guardadas.set(e.idOrigen, e)); if (nuevo) control = nuevo;
    });
    const repo = { control: async () => control, conocidas: async () => [...guardadas.values()].map(e => e.docEntry), guardar };
    const fuente = { descubrir: async (_cursor: number, _cantidad?: number, anterior?: boolean) => anterior ? [] : [6669],
      descubrirFacturas: async () => [], obtener: vi.fn(async () => [actual]) };
    const servicio = new EntregaSapSincronizador(fuente as unknown as EntregaSapFuente, repo as unknown as EntregaSapRepositorio);
    return { servicio, fuente, guardar, guardadas, cambiar: (e: EntregaSapPersistida) => { actual=e; } };
  };
  it('un refresh repetido conserva una única entrega', async () => {
    const p = preparar(); await p.servicio.sincronizar(); await p.servicio.sincronizar();
    expect(p.guardadas.size).toBe(1); expect(p.guardar).toHaveBeenCalledTimes(2);
  });
  it('factura posterior actualiza el mismo id, fecha y artículos', async () => {
    const p = preparar(); await p.servicio.sincronizar();
    const antes = p.guardadas.get('SAP:PAJARO_AZUL:15:6669')!;
    p.cambiar(entrega({},[factura])); await p.servicio.sincronizar();
    const despues = p.guardadas.get(antes.idOrigen)!;
    expect(p.guardadas.size).toBe(1); expect(despues.estadoFinanciero).toBe('Facturado');
    expect(despues.fechaEntrega).toBe(antes.fechaEntrega); expect(despues.lineas).toEqual(antes.lineas);
  });
  it('un error SAP no guarda vacío ni avanza el cursor', async () => {
    const p = preparar(); await p.servicio.sincronizar();
    p.fuente.obtener.mockRejectedValueOnce(new Error('SAP caído'));
    await expect(p.servicio.sincronizar()).rejects.toThrow('SAP caído');
    expect(p.guardar).toHaveBeenCalledTimes(1); expect(p.guardadas.size).toBe(1);
  });
  it('un lote incompleto tampoco reemplaza datos', async () => {
    const p = preparar(); p.fuente.obtener.mockResolvedValueOnce([]);
    await expect(p.servicio.sincronizar()).rejects.toThrow('incompleto'); expect(p.guardar).not.toHaveBeenCalled();
  });
});

describe('Respuesta HTTP protegida de detalle', () => {
  it.each(['ADMINISTRADOR', 'OPERADOR_BODEGA', 'CONSULTA'])('respeta rol de sesión %s, no el query string', async rol => {
    const repositorio = { obtener: vi.fn(async () => proyectarEntregaSap(entrega(),fecha,'ADMINISTRADOR')) };
    const servicio = new HistorialServicio(undefined,undefined,undefined,undefined, repositorio as unknown as EntregaSapRepositorio);
    const app = express();
    app.use((req, _res, next) => {
      req.user = { usuarioId: '1', nombreUsuario: 'prueba', nombreVisible: 'Prueba', codigoRol: rol,
        codigoAlmacen: null, codigosAlmacenVisibles: ['TSPS01'], sesionId: 'prueba', debeCambiarContrasena: false };
      next();
    });
    app.use('/historial', crearHistorialRutas(servicio));
    const respuesta = await request(app).get('/historial/SAP:PAJARO_AZUL:15:6669?rol=ADMINISTRADOR');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.estadoHistorial).toBe('Entregado, Sin factura');
    if (rol === 'ADMINISTRADOR') expect(respuesta.body.datos.auditoriaSap.usuarioRegistrador).toBe('PIERROT');
    else expect(JSON.stringify(respuesta.body)).not.toMatch(/PIERROT|auditoriaSap|usuarioRegistrador/);
    expect(repositorio.obtener).toHaveBeenCalledWith('SAP:PAJARO_AZUL:15:6669',rol);
  });
});
