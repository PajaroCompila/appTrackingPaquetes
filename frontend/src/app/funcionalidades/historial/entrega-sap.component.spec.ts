import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HistorialComponent } from './historial.component';
import { HistorialService } from './historial.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { ConsultaInventarioArticuloService } from '../../compartido/inventario/consulta-inventario-articulo.service';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import type { HistorialValidado } from './historial.interface';

const documento = (admin = false, facturado = false): HistorialValidado => ({
  idOrigen: 'SAP:PAJARO_AZUL:15:6669', origenPedido: 'SAP', creadoEnR1: false,
  sapDocEntry: '6669', folioPedido: '40968', numeroPedido: '40968', codigoVenta: null, codigoVendedor: null,
  nombreVendedor: 'SPS Hector Alvi Cedillo', codigosAlmacen: ['TSPS01','BSPS03'], nombresBodega: 'Tiendas SPS',
  fechaHoraPedido: '2026-09-14T09:02:01', codigoEstadoVenta: null, codigoSincronizacion: null,
  articulos: [{ identificadorDetalle: '0', codigoArticulo: 'YAM-MODX7', descripcion: 'Sintetizador',
    cantidad: 1, codigoAlmacen: 'TSPS01', nombreAlmacen: 'Tienda Principal', usuarioAsignado: null }],
  estadoLocal: 'VALIDADO', despachadoEn: null, validadoDetectadoEn: '2026-09-16T10:00:00Z', usuarioDespacho: null,
  estadoHistorial: facturado ? 'Facturado' : 'Entregado, Sin factura',
  entregaSap: { empresa: 'PAJARO_AZUL', objType: 15, docEntry: 6669, docNum: '40968',
    tipo: 'Entrega desde cotización', fechaEntrega: '2026-09-14T09:02:01', referenciaR1: 'SPSS04CO60265',
    bases: [{ baseType: 23, baseEntry: 160052, baseLine: 2, numeroDocumento: '100206148' }],
    facturas: facturado ? [{ docEntry: 900000, docNum: '201646999' }] : [] },
  ...(admin ? { auditoriaSap: { usuarioRegistrador: 'PIERROT', nombreRegistrador: 'Pierrot Maalouf',
    documentoEntrega: '40968', fechaEntrega: '2026-09-14T09:02:01' } } : {}),
});

describe('Historial de entrega SAP en la vista existente', () => {
  const preparar = async (admin: boolean, facturado: boolean) => {
    const obtener = vi.fn().mockReturnValue(of({ datos: documento(admin,facturado) }));
    await TestBed.configureTestingModule({ imports: [HistorialComponent], providers: [
      provideRouter([]),
      { provide: HistorialService, useValue: { obtener } },
      { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn() } },
      { provide: ConsultaInventarioArticuloService, useValue: { abrir: vi.fn() } },
      { provide: ImpresionesService, useValue: { consultar: vi.fn().mockReturnValue(of({datos:[]})), registrar: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: {
        paramMap: convertToParamMap({ idOrigen: 'SAP:PAJARO_AZUL:15:6669' }), queryParamMap: convertToParamMap({}),
      } } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, obtener };
  };
  it('presenta entrega, cotización y Pedido No aplica, sin atribuir responsable R1', async () => {
    const {fixture} = await preparar(true,false);
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Entrega SAP 40968'); expect(texto).toContain('Entregado, Sin factura');
    expect(texto).toContain('100206148'); expect(texto).toContain('No aplica');
    expect(texto).toContain('Sin asignar'); expect(texto).toContain('Usuario SAP que registró la entrega');
    expect(texto).toContain('PIERROT'); expect(texto).not.toContain('Ana Calix');
    expect(texto).not.toContain('101475685'); fixture.destroy();
  });
  it('no muestra bloque administrativo cuando la API no lo devuelve', async () => {
    const {fixture} = await preparar(false,false);
    expect(fixture.nativeElement.textContent).not.toContain('PIERROT');
    expect(fixture.nativeElement.querySelector('#titulo-auditoria-sap')).toBeNull(); fixture.destroy();
  });
  it('Facturado usa detalle normal, incluso si hubiera auditoría sobrante', async () => {
    const {fixture} = await preparar(true,true);
    expect(fixture.nativeElement.textContent).toContain('Facturado');
    expect(fixture.nativeElement.querySelector('#titulo-auditoria-sap')).toBeNull(); fixture.destroy();
  });
  it('el número real se conserva como entrega tanto para documento como artículo', async () => {
    const {fixture} = await preparar(false,false);
    expect(fixture.componentInstance.numeroDocumento(documento())).toBe('Entrega SAP 40968'); fixture.destroy();
  });
});
