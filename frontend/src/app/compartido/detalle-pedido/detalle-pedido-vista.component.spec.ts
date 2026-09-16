import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from './detalle-pedido-vista.interface';
import { DetallePedidoVistaComponent } from './detalle-pedido-vista.component';
import { ConsultaInventarioArticuloService } from '../inventario/consulta-inventario-articulo.service';
import { ImpresionesService } from '../impresiones/impresiones.service';
import { of } from 'rxjs';

describe('DetallePedidoVistaComponent', () => {
  let fixture: ComponentFixture<DetallePedidoVistaComponent>;
  const abrirInventario = vi.fn();
  const consultarImpresiones = vi.fn();
  const registrarImpresiones = vi.fn();
  const configuracion: ConfiguracionDetallePedido = {
    contexto: 'Consulta', titulo: 'Detalle del pedido', descripcion: 'Descripción contextual',
    etiquetaEstado: 'Pendiente', severidadEstado: 'advertencia',
    etiquetaRetorno: 'Regresar al listado', tituloInformacion: 'Información operativa',
    etiquetaArticulos: 'Artículos del pedido',
  };
  const pedido: PedidoDetalleVisual = {
    idOrigen: 'R1:F1', numeroPedido: '001234', vendedor: null,
    fechaPedido: '2026-08-06T12:30:00', bodega: null,
    datosOperativos: [
      { etiqueta: 'Usuario', valor: null, icono: 'pi pi-user' },
      { etiqueta: 'Fecha', valor: '2026-08-06T13:00:00', icono: 'pi pi-calendar', esFecha: true },
    ],
    articulos: [
      { clave: '1', identificadorDetalle: '1', codigo: 'ARTICULO-CODIGO-EXTENSO-001', descripcion: 'Descripción extensa que debe conservarse completa y ajustarse dentro de la celda.', cantidad: 2, codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega original' },
      { clave: '2', identificadorDetalle: '2', codigo: 'A2', descripcion: 'Segundo artículo', cantidad: 1, codigoAlmacen: 'BTGU01' },
    ],
  };

  beforeEach(async () => {
    abrirInventario.mockClear();
    consultarImpresiones.mockReset().mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1', cantidadImpresiones: 1,
      ultimaImpresionEn: '2026-09-08T10:00:00.000Z',
    }] }));
    registrarImpresiones.mockReset().mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '2', cantidadImpresiones: 1,
      ultimaImpresionEn: '2026-09-08T10:05:00.000Z',
    }] }));
    await TestBed.configureTestingModule({
      imports: [DetallePedidoVistaComponent],
      providers: [
        { provide: ConsultaInventarioArticuloService, useValue: { abrir: abrirInventario } },
        { provide: ImpresionesService, useValue: {
          consultar: consultarImpresiones, registrar: registrarImpresiones,
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DetallePedidoVistaComponent);
    fixture.componentRef.setInput('configuracion', configuracion);
  });

  it('presenta cabecera, estado, valores nulos y múltiples artículos sin perder datos', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Pedido #001234');
    expect(texto).toContain('Pendiente');
    expect(texto).toContain('No disponible');
    expect(texto).toContain('ARTICULO-CODIGO-EXTENSO-001');
    expect(texto).toContain('Descripción extensa');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(texto).toContain('3');
  });

  it('consulta inventario desde el código con el valor completo y la bodega de la partida', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();
    const codigo = fixture.nativeElement.querySelector('.codigo-articulo') as HTMLElement;

    codigo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(abrirInventario).toHaveBeenCalledWith('ARTICULO-CODIGO-EXTENSO-001', 'BSPS01');
  });

  it('recupera y muestra el estado impreso usando la identidad estable del artículo', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();

    expect(consultarImpresiones).toHaveBeenCalledWith([
      { idOrigen: 'R1:F1', identificadorDetalle: '1' },
      { idOrigen: 'R1:F1', identificadorDetalle: '2' },
    ]);
    expect(fixture.nativeElement.querySelectorAll('.indicador-impreso-detalle')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Impreso');
  });

  it('abre la vista previa sin mostrar una confirmación adicional', () => {
    vi.useFakeTimers();
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const confirmar = vi.spyOn(window, 'confirm');
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();
    const checks = fixture.nativeElement.querySelectorAll(
      '.selector-impresion-detalle input',
    ) as NodeListOf<HTMLInputElement>;
    checks[1]!.checked = true;
    checks[1]!.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.boton-imprimir-detalle') as HTMLButtonElement).click();
    vi.runAllTimers();
    fixture.detectChanges();

    expect(imprimir).toHaveBeenCalledOnce();
    expect(confirmar).not.toHaveBeenCalled();
    expect(registrarImpresiones).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('.indicador-impreso-detalle')).toHaveLength(1);
    confirmar.mockRestore();
    imprimir.mockRestore();
    vi.useRealTimers();
  });

  it('muestra un esqueleto durante la carga sin presentar datos anteriores', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.componentRef.setInput('cargando', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.esqueleto')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('001234');
  });

  it('explica cuando el pedido no tiene artículos', () => {
    fixture.componentRef.setInput('pedido', { ...pedido, articulos: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Este pedido no tiene artículos.');
    expect(fixture.nativeElement.querySelector('.tabla-detalle-articulos')).toBeNull();
  });

  it('muestra los cambios reales y no atribuye una modificación sin responsable', () => {
    fixture.componentRef.setInput('pedido', { ...pedido, modificaciones: [{
      tipo: 'CANTIDAD', identificadorDetalle: '1', codigoArticulo: 'ARTICULO-1',
      descripcion: 'Artículo uno', cantidadAnterior: 1, cantidadNueva: 4,
      codigoAlmacenAnterior: 'B1', codigoAlmacenNuevo: 'B1',
      detectadoEn: '2026-09-10T15:15:00-06:00', modificadoPor: null,
    }] });
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Modificaciones del pedido');
    expect(texto).toContain('Cambios de cantidad');
    expect(texto).toContain('1 → 4');
    expect(texto).not.toContain('Modificado por');
  });

  it('presenta un error controlado y permite reintentar', () => {
    const reintentar = vi.fn();
    fixture.componentInstance.reintentar.subscribe(reintentar);
    fixture.componentRef.setInput('error', {
      titulo: 'No pudimos cargar el pedido', detalle: 'Probá de nuevo.', idSeguimiento: 'ABC-1',
    });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.boton-reintentar').click();

    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar el pedido');
    expect(fixture.nativeElement.textContent).toContain('ABC-1');
    expect(reintentar).toHaveBeenCalledOnce();
  });

  it('emite la navegación de regreso desde el botón semántico', () => {
    const regresar = vi.fn();
    fixture.componentInstance.regresar.subscribe(regresar);
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();
    const boton = fixture.nativeElement.querySelector('.boton-regresar-detalle') as HTMLButtonElement;
    boton.click();

    expect(boton.getAttribute('aria-label')).toBe('Regresar al listado');
    expect(regresar).toHaveBeenCalledOnce();
  });
});
