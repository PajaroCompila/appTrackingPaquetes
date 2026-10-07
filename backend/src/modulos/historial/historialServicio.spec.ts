import { describe, expect, it, vi } from 'vitest';
import { HistorialServicio } from './historialServicio.js';
import type { HistorialRepositorio } from './historialRepositorio.js';
import type { HistorialR1Repositorio } from './historialR1Repositorio.js';
import type { PedidoHistorial } from './historial.interface.js';
import type { AsignacionRepositorio } from '../asignaciones/asignacionRepositorio.js';
import type { EntregaSapRepositorio } from './entregaSapRepositorio.js';

const registro = (idOrigen: string, estadoLocal: 'VALIDADO' | 'DESPACHADO', fecha: string): PedidoHistorial => ({
  idOrigen, origenPedido: idOrigen.startsWith('SAP:') ? 'SAP' : 'R1',
  creadoEnR1: !idOrigen.startsWith('SAP:'), sapDocEntry: idOrigen.startsWith('SAP:') ? '10' : null,
  folioPedido: idOrigen, numeroPedido: idOrigen, codigoVenta: null, codigoVendedor: null,
  nombreVendedor: null, codigosAlmacen: ['B1'], nombresBodega: 'Bodega 1', fechaHoraPedido: fecha,
  codigoEstadoVenta: estadoLocal, codigoSincronizacion: null, articulos: [], estadoLocal,
  despachadoEn: fecha, validadoDetectadoEn: estadoLocal === 'VALIDADO' ? fecha : null,
  usuarioDespacho: 'Operador',
});

const paginaVacia = { registros: [] as [], pagina: 1, cantidadPorPagina: 25,
  totalRegistros: 0, hayMas: false };
const entregasVacias = (): EntregaSapRepositorio => ({
  buscar: vi.fn().mockResolvedValue(paginaVacia),
  buscarArticulos: vi.fn().mockResolvedValue(paginaVacia),
} as unknown as EntregaSapRepositorio);
const servicioListado = (repositorio: HistorialRepositorio, repositorioR1: HistorialR1Repositorio) =>
  new HistorialServicio(repositorio, repositorioR1, {} as AsignacionRepositorio,
    undefined, entregasVacias());

describe('HistorialServicio', () => {
  it('identifica el cerrado 500313581 en Pedido, Artículos y Detalle sin cambiar facturados ni entregas', async () => {
    const cerrado = {...registro('SAP:1', 'VALIDADO', '2026-10-02T10:07:00'), numeroPedido:'500313581'};
    const cancelado = {...registro('SAP:3', 'VALIDADO', '2026-10-02T10:05:00'), numeroPedido:'500313583'};
    const facturado = {...registro('SAP:2', 'VALIDADO', '2026-10-02T10:00:00'), numeroPedido:'500313582', estadoHistorial:'Facturado' as const};
    const pagina = {registros:[cerrado,cancelado,facturado],pagina:1,cantidadPorPagina:25,totalRegistros:3,hayMas:false};
    const repo = {obtenerEstadosSinFactura:vi.fn().mockResolvedValue(new Map([
      ['500313581','CERRADO'],['500313583','CERRADO'],['500313582','CERRADO'],
    ])),
      registrarIngresosHistorial:vi.fn().mockImplementation(async (ids: string[]) =>
        new Map(ids.map((id) => [id, '2026-10-02T10:10:00.000Z']))),
      buscarHistorial:vi.fn().mockResolvedValue(pagina),
      buscarArticulosHistorial:vi.fn().mockResolvedValue({...pagina,registros:[{...cerrado,codigoArticulo:'A1',identificadorDetalle:'0'}]}),
      obtenerHistorial:vi.fn().mockResolvedValue(cerrado),
      obtenerReceptorDevolucion:vi.fn().mockResolvedValue('Marcos Pérez')} as unknown as HistorialRepositorio;
    const r1 = {buscar:vi.fn().mockResolvedValue({...pagina,registros:[],totalRegistros:0}),
      buscarArticulos:vi.fn().mockResolvedValue({...pagina,registros:[],totalRegistros:0})} as unknown as HistorialR1Repositorio;
    const servicio = servicioListado(repo,r1);
    const filtros = {fechaDesde:'2026-10-02',fechaHasta:'2026-10-02',codigosAlmacen:[],pagina:1,cantidadPorPagina:25};
    const pedidos = await servicio.buscar(filtros);
    expect(pedidos.registros.find(p=>p.numeroPedido==='500313581')?.estadoHistorial).toBe('CERRADO');
    expect(pedidos.registros.find(p=>p.numeroPedido==='500313583')?.estadoHistorial).toBe('CERRADO');
    expect(pedidos.registros.find(p=>p.numeroPedido==='500313582')?.estadoHistorial).toBe('Facturado');
    expect((await servicio.buscarArticulos(filtros)).registros[0]?.estadoHistorial).toBe('CERRADO');
    expect(await servicio.obtener('SAP:1')).toMatchObject({
      estadoHistorial: 'CERRADO', recibidoPor: 'Marcos Pérez',
    });
    expect(repo.obtenerReceptorDevolucion).toHaveBeenCalledWith('SAP:1');
  });
  it('da prioridad a la factura R1 confirmada sobre el estado cerrado', async () => {
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      obtenerDespachadosPendientes: vi.fn().mockResolvedValue([
        { idOrigen: 'R1:F1', folioPedido: 'F1', numeroPedido: '100' },
        { idOrigen: 'R1:F2', folioPedido: 'F2', numeroPedido: '101' },
        { idOrigen: 'R1:F3', folioPedido: 'F3', numeroPedido: '102' },
      ]),
      obtenerDespachadosSapPendientes: vi.fn().mockResolvedValue([]),
      conservarCerradosSapSinDespacho: vi.fn().mockResolvedValue(0),
      obtenerCerradosSap: vi.fn().mockResolvedValue([]),
      obtenerFacturadosSapPorNumero: vi.fn().mockResolvedValue(new Set()),
      obtenerEstadosR1: vi.fn().mockResolvedValue(new Map([
        ['R1:F1', { codigoSucursal: 'SPS', codigoEstadoVenta: 'C', verificado: false, facturado: false }],
        ['R1:F2', { codigoSucursal: 'SPS', codigoEstadoVenta: 'A', verificado: true, facturado: true }],
        ['R1:F3', { codigoSucursal: 'SPS', codigoEstadoVenta: 'C', verificado: true, facturado: true }],
      ])),
      marcarCerrados: vi.fn().mockResolvedValue(1),
      marcarValidados: vi.fn().mockResolvedValue(2),
    } as unknown as HistorialRepositorio;
    const servicio = new HistorialServicio(repositorio);

    await expect(servicio.sincronizar()).resolves.toBe(3);
    expect(repositorio.obtenerEstadosR1).toHaveBeenCalledWith([
      { idOrigen: 'R1:F1', folioPedido: 'F1', numeroPedido: '100' },
      { idOrigen: 'R1:F2', folioPedido: 'F2', numeroPedido: '101' },
      { idOrigen: 'R1:F3', folioPedido: 'F3', numeroPedido: '102' },
    ]);
    expect(repositorio.marcarCerrados).toHaveBeenCalledWith(['R1:F1']);
    expect(repositorio.marcarValidados).toHaveBeenCalledWith([
      { idOrigen: 'R1:F2', codigoSucursal: 'SPS' },
      { idOrigen: 'R1:F3', codigoSucursal: 'SPS' },
    ]);
  });

  it('es idempotente cuando ya no quedan cabeceras en DESPACHADO', async () => {
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      obtenerDespachadosPendientes: vi.fn().mockResolvedValue([]),
      obtenerDespachadosSapPendientes: vi.fn().mockResolvedValue([]),
      conservarCerradosSapSinDespacho: vi.fn().mockResolvedValue(0),
      obtenerCerradosSap: vi.fn().mockResolvedValue([]),
      obtenerFacturadosSapPorNumero: vi.fn().mockResolvedValue(new Set()),
      obtenerEstadosR1: vi.fn().mockResolvedValue(new Map()),
      marcarCerrados: vi.fn().mockResolvedValue(0),
      marcarValidados: vi.fn().mockResolvedValue(0),
    } as unknown as HistorialRepositorio;

    await expect(new HistorialServicio(repositorio).sincronizar()).resolves.toBe(0);
    expect(repositorio.marcarCerrados).toHaveBeenCalledWith([]);
    expect(repositorio.marcarValidados).toHaveBeenCalledWith([]);
  });

  it('solo valida cierres SAP con factura y conserva entrega sin factura pendiente de recepcion', async () => {
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      obtenerDespachadosPendientes: vi.fn().mockResolvedValue([]),
      obtenerDespachadosSapPendientes: vi.fn().mockResolvedValue([
        { idOrigen: 'SAP:10', sapDocEntry: '10' },
        { idOrigen: 'SAP:11', sapDocEntry: '11' },
      ]),
      conservarCerradosSapSinDespacho: vi.fn().mockResolvedValue(0),
      obtenerEstadosR1: vi.fn().mockResolvedValue(new Map()),
      obtenerCerradosSap: vi.fn().mockResolvedValue([{
        idOrigen: 'SAP:10', sapDocEntry: '10', numeroPedido: 100,
        estadoActual: 'C', tieneEntrega: false, tieneFacturaDirecta: true,
        tieneFacturaViaEntrega: false,
        tipoCierre: 'CERRADO CON FACTURA DIRECTA',
      }, {
        idOrigen: 'SAP:11', sapDocEntry: '11', numeroPedido: 101,
        estadoActual: 'C', tieneEntrega: true, tieneFacturaDirecta: false,
        tieneFacturaViaEntrega: false,
        tipoCierre: 'CERRADO SIN ENTREGA NI FACTURA',
      }]),
      obtenerFacturadosSapPorNumero: vi.fn().mockResolvedValue(new Set()),
      marcarCerrados: vi.fn().mockResolvedValue(1),
      marcarValidados: vi.fn().mockResolvedValue(1),
    } as unknown as HistorialRepositorio;

    await expect(new HistorialServicio(repositorio).sincronizar()).resolves.toBe(2);
    expect(repositorio.obtenerCerradosSap).toHaveBeenCalledWith([
      { idOrigen: 'SAP:10', sapDocEntry: '10' },
      { idOrigen: 'SAP:11', sapDocEntry: '11' },
    ]);
    expect(repositorio.marcarValidados).toHaveBeenCalledWith([
      { idOrigen: 'SAP:10', codigoSucursal: null },
    ]);
    expect(repositorio.marcarCerrados).toHaveBeenCalledWith(['SAP:11']);
  });

  it('da prioridad a factura via entrega y no duplica el mismo pedido cerrado', async () => {
    const local = { ...registro('R1:TSPS01:F1', 'DESPACHADO', '2026-10-06T10:00:00'),
      numeroPedido: '101', estadoLocal: 'CERRADO' as const, estadoHistorial: 'CERRADO' as const };
    const snapshot = { ...registro('SAP:10', 'VALIDADO', '2026-10-06T10:00:00'),
      numeroPedido: '101', estadoHistorial: 'CERRADO' as const };
    const facturado = { ...registro('R1:TSPS01:F2', 'VALIDADO', '2026-10-06T10:00:00'),
      numeroPedido: '102', estadoHistorial: 'Facturado' as const };
    const cerradoDuplicado = { ...registro('SAP:11', 'VALIDADO', '2026-10-06T10:00:00'),
      numeroPedido: '102', estadoHistorial: 'CERRADO' as const };
    const pagina = { pagina: 1, cantidadPorPagina: 25, totalRegistros: 2, hayMas: false };
    const repo = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      registrarIngresosHistorial: vi.fn().mockImplementation(async (ids: string[]) =>
        new Map(ids.map(id => [id, '2026-10-06T10:05:00.000Z']))),
      buscarHistorial: vi.fn().mockResolvedValue({ ...pagina, registros: [local, snapshot, cerradoDuplicado] }),
    } as unknown as HistorialRepositorio;
    const r1 = { buscar: vi.fn().mockResolvedValue({ ...pagina, registros: [facturado] })
    } as unknown as HistorialR1Repositorio;

    const resultado = await servicioListado(repo, r1).buscar({ fechaDesde: '2026-10-06',
      fechaHasta: '2026-10-06', codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 });

    expect(resultado.registros.filter(p => p.numeroPedido === '101')).toHaveLength(1);
    expect(resultado.registros.find(p => p.numeroPedido === '102')?.estadoHistorial).toBe('Facturado');
  });

  it('promueve a Facturado un despacho R1 cerrado cuando SAP tiene factura valida', async () => {
    const candidato = { idOrigen: 'R1:TSPS01:SPSS27PE388062',
      folioPedido: 'SPSS27PE388062', numeroPedido: '101478078' };
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      obtenerDespachadosPendientes: vi.fn().mockResolvedValue([candidato]),
      obtenerDespachadosSapPendientes: vi.fn().mockResolvedValue([]),
      conservarCerradosSapSinDespacho: vi.fn().mockResolvedValue(0),
      obtenerEstadosR1: vi.fn().mockResolvedValue(new Map([[candidato.idOrigen, {
        codigoSucursal: 'SPS', codigoEstadoVenta: 'C', verificado: false, facturado: false,
      }]])),
      obtenerCerradosSap: vi.fn().mockResolvedValue([]),
      obtenerFacturadosSapPorNumero: vi.fn().mockResolvedValue(new Set([candidato.idOrigen])),
      marcarCerrados: vi.fn().mockResolvedValue(0),
      marcarValidados: vi.fn().mockResolvedValue(1),
    } as unknown as HistorialRepositorio;

    await expect(new HistorialServicio(repositorio).sincronizar()).resolves.toBe(1);
    expect(repositorio.marcarCerrados).toHaveBeenCalledWith([]);
    expect(repositorio.marcarValidados).toHaveBeenCalledWith([
      { idOrigen: candidato.idOrigen, codigoSucursal: 'SPS' },
    ]);
  });

  it('combina el historial validado de R1 con pedidos SAP cerrados conservados localmente', async () => {
    const sap = registro('SAP:10', 'VALIDADO', '2026-08-15T12:00:00.000Z');
    const r1 = registro('R1:TSPS01:F1', 'VALIDADO', '2026-08-15T11:00:00.000Z');
    const registrarIngresosHistorial = vi.fn().mockImplementation(async (ids: string[]) =>
      new Map(ids.map((id) => [id, '2026-08-15T12:05:00.000Z'])));
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      registrarIngresosHistorial, buscarHistorial: vi.fn().mockResolvedValue({ registros: [sap], pagina: 1,
      cantidadPorPagina: 25, hayMas: false }) } as unknown as HistorialRepositorio;
    const repositorioR1 = { buscar: vi.fn().mockResolvedValue({ registros: [r1], pagina: 1,
      cantidadPorPagina: 25, hayMas: false }) } as unknown as HistorialR1Repositorio;

    const resultado = await servicioListado(repositorio, repositorioR1).buscar({
      fechaDesde: '2026-08-01', fechaHasta: '2026-08-15', codigosAlmacen: [], pagina: 1,
      cantidadPorPagina: 25,
    });

    expect(resultado.registros.map(({ idOrigen }) => idOrigen)).toEqual(['SAP:10', 'R1:TSPS01:F1']);
    expect(resultado.registros[0]).toMatchObject({ estadoLocal: 'VALIDADO',
      validadoDetectadoEn: '2026-08-15T12:00:00.000Z',
      historialIngresadoEn: '2026-08-15T12:05:00.000Z' });
    expect(resultado.registros[1]?.historialIngresadoEn).toBe('2026-08-15T12:05:00.000Z');
    expect(registrarIngresosHistorial).toHaveBeenCalledWith(['SAP:10', 'R1:TSPS01:F1']);
  });

  it('recupera el detalle SAP desde PedidosBodega sin consultar nuevamente SAP', async () => {
    const sap = registro('SAP:10', 'VALIDADO', '2026-08-15T12:00:00.000Z');
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      registrarIngresosHistorial: vi.fn().mockResolvedValue(new Map([
        ['SAP:10', '2026-08-15T12:05:00.000Z'],
      ])), obtenerHistorial: vi.fn().mockResolvedValue(sap) } as unknown as HistorialRepositorio;
    const repositorioR1 = { obtener: vi.fn() } as unknown as HistorialR1Repositorio;

    await expect(new HistorialServicio(repositorio, repositorioR1).obtener('SAP:10')).resolves.toEqual(sap);
    expect(repositorio.obtenerHistorial).toHaveBeenCalledWith('SAP:10');
    expect(repositorioR1.obtener).not.toHaveBeenCalled();
    expect(sap.historialIngresadoEn).toBe('2026-08-15T12:05:00.000Z');
  });

  it('mantiene fija la marca persistida de ingreso y reutiliza el resultado durante la cache corta', async () => {
    const pedido = { ...registro('R1:TSPS01:F1', 'VALIDADO', '2026-08-15T11:00:00.000Z'),
      despachadoEn: null, validadoDetectadoEn: null };
    const pagina = { registros: [pedido], pagina: 1, cantidadPorPagina: 25,
      totalRegistros: 1, hayMas: false };
    const ingreso = '2026-08-15T11:10:00.000Z';
    const registrarIngresosHistorial = vi.fn().mockResolvedValue(new Map([[pedido.idOrigen, ingreso]]));
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      registrarIngresosHistorial,
      buscarHistorial: vi.fn().mockResolvedValue({ ...pagina, registros: [] }),
    } as unknown as HistorialRepositorio;
    const repositorioR1 = { buscar: vi.fn().mockResolvedValue(pagina) } as unknown as HistorialR1Repositorio;
    const servicio = servicioListado(repositorio, repositorioR1);
    const filtros = { fechaDesde: '2026-08-15', fechaHasta: '2026-08-15',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 };

    const primera = await servicio.buscar(filtros);
    const segunda = await servicio.buscar(filtros);

    expect(primera.registros[0]?.historialIngresadoEn).toBe(ingreso);
    expect(segunda.registros[0]?.historialIngresadoEn).toBe(ingreso);
    expect(registrarIngresosHistorial).toHaveBeenCalledOnce();
  });

  it('deduplica consultas concurrentes identicas y vuelve a consultar al expirar la cache', async () => {
    let resolverConsulta!: (valor: {
      registros: []; pagina: number; cantidadPorPagina: number; totalRegistros: number; hayMas: boolean;
    }) => void;
    const pendiente = new Promise<{
      registros: []; pagina: number; cantidadPorPagina: number; totalRegistros: number; hayMas: boolean;
    }>((resolver) => { resolverConsulta = resolver; });
    const paginaVacia = { registros: [] as [], pagina: 1, cantidadPorPagina: 25,
      totalRegistros: 0, hayMas: false };
    const repositorio = ({
      buscarArticulosHistorial: vi.fn().mockResolvedValue(paginaVacia),
    } as unknown as HistorialRepositorio);
    const repositorioR1 = { buscarArticulos: vi.fn()
      .mockReturnValueOnce(pendiente).mockResolvedValue(paginaVacia) } as unknown as HistorialR1Repositorio;
    const entregas = ({
      buscarArticulos: vi.fn().mockResolvedValue(paginaVacia),
    } as unknown as EntregaSapRepositorio);
    let reloj = 1_000;
    const servicio = new HistorialServicio(repositorio, repositorioR1,
      {} as AsignacionRepositorio, undefined, entregas, 15_000, () => reloj);
    const filtros = { fechaDesde: '2026-10-06', fechaHasta: '2026-10-06',
      codigosAlmacen: ['BSPS04'], pagina: 1, cantidadPorPagina: 25, clasificacion: 'normal' as const };

    const primera = servicio.buscarArticulos(filtros);
    const segunda = servicio.buscarArticulos({ ...filtros, codigosAlmacen: ['BSPS04'] });
    await vi.waitFor(() => expect(repositorioR1.buscarArticulos).toHaveBeenCalledOnce());
    resolverConsulta(paginaVacia);
    await expect(Promise.all([primera, segunda])).resolves.toHaveLength(2);

    await servicio.buscarArticulos(filtros);
    expect(repositorioR1.buscarArticulos).toHaveBeenCalledOnce();
    reloj += 15_001;
    await servicio.buscarArticulos(filtros);
    expect(repositorioR1.buscarArticulos).toHaveBeenCalledTimes(2);
  });

  it('delega el listado por artículos sin consultar detalles uno por uno', async () => {
    const repositorio = { obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()), buscarArticulosHistorial: vi.fn().mockResolvedValue({
      registros: [], pagina: 1, cantidadPorPagina: 25, hayMas: false,
    }) } as unknown as HistorialRepositorio;
    const repositorioConsulta = { buscarArticulos: vi.fn().mockResolvedValue({
      registros: [], pagina: 1, cantidadPorPagina: 25, hayMas: false,
    }) } as unknown as HistorialR1Repositorio;
    const filtros = { fechaDesde: '2026-08-01', fechaHasta: '2026-08-28',
      codigosAlmacen: ['BSPS01'], pagina: 1, cantidadPorPagina: 25 };

    await expect(servicioListado(repositorio, repositorioConsulta)
      .buscarArticulos(filtros)).resolves.toMatchObject({ pagina: 1, hayMas: false });
    expect(repositorioConsulta.buscarArticulos).toHaveBeenCalledOnce();
    expect(repositorioConsulta.buscarArticulos).toHaveBeenCalledWith(filtros);
    expect(repositorio.buscarArticulosHistorial).toHaveBeenCalledWith(filtros);
  });

  it('no convierte una fuente fallida en resultado vacío ni conserva el error en caché', async () => {
    const repositorio = {
      buscarArticulosHistorial: vi.fn().mockResolvedValue(paginaVacia),
    } as unknown as HistorialRepositorio;
    const buscarArticulos = vi.fn()
      .mockRejectedValueOnce(new Error('tiempo de espera R1'))
      .mockResolvedValue(paginaVacia);
    const repositorioR1 = { buscarArticulos } as unknown as HistorialR1Repositorio;
    const servicio = servicioListado(repositorio, repositorioR1);
    const filtros = { fechaDesde: '2026-10-07', fechaHasta: '2026-10-07',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 };

    await expect(servicio.buscarArticulos(filtros)).rejects.toMatchObject({
      estadoHttp: 503, codigo: 'HISTORIAL_NO_DISPONIBLE',
    });
    await expect(servicio.buscarArticulos(filtros)).resolves.toMatchObject({
      registros: [], totalRegistros: 0,
    });
    expect(buscarArticulos).toHaveBeenCalledTimes(2);
  });

  it('conserva filas válidas como resultado parcial e identifica la fuente fallida', async () => {
    const pedido = registro('SAP:20', 'VALIDADO', '2026-10-07T12:00:00.000Z');
    const repositorio = {
      buscarHistorial: vi.fn().mockResolvedValue({ ...paginaVacia, registros:[pedido], totalRegistros:1 }),
      obtenerEstadosSinFactura: vi.fn().mockResolvedValue(new Map()),
      registrarIngresosHistorial: vi.fn().mockResolvedValue(new Map([[pedido.idOrigen,
        '2026-10-07T12:01:00.000Z']])),
    } as unknown as HistorialRepositorio;
    const repositorioR1 = {
      buscar: vi.fn().mockRejectedValue(new Error('sucursal inaccesible')),
    } as unknown as HistorialR1Repositorio;

    await expect(servicioListado(repositorio, repositorioR1).buscar({
      fechaDesde:'2026-10-07',fechaHasta:'2026-10-07',codigosAlmacen:[],pagina:1,cantidadPorPagina:25,
    })).resolves.toMatchObject({
      registros:[expect.objectContaining({idOrigen:'SAP:20'})],
      advertenciasFuentes:['No fue posible consultar R1.'],
    });
  });
});
