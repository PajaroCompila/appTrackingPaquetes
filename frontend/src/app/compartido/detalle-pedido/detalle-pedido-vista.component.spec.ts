import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from './detalle-pedido-vista.interface';
import { DetallePedidoVistaComponent } from './detalle-pedido-vista.component';
import { ConsultaInventarioArticuloService } from '../inventario/consulta-inventario-articulo.service';
import { ImpresionesService } from '../impresiones/impresiones.service';
import { of, Subject, throwError } from 'rxjs';

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
    // JSDOM no implementa los métodos del diálogo nativo; Edge sí.
    if (!HTMLDialogElement.prototype.showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true, value(this: HTMLDialogElement) { this.open = true; },
    });
    if (!HTMLDialogElement.prototype.close) Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true, value(this: HTMLDialogElement) { this.open = false; },
    });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
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

    codigo.dispatchEvent(new MouseEvent('click', { bubbles: true }));

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

  it('abre la vista previa y solicita confirmación propia solo después de cerrar el diálogo nativo', () => {
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
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    window.dispatchEvent(new Event('afterprint'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('¿La impresión o el PDF se generó correctamente?');
    expect(fixture.nativeElement.querySelectorAll('.indicador-impreso-detalle')).toHaveLength(1);
    confirmar.mockRestore();
    imprimir.mockRestore();
    vi.useRealTimers();
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function prepararTresArticulos(): PedidoDetalleVisual {
    consultarImpresiones.mockReturnValue(of({ datos: [] }));
    const tres = { ...pedido, articulos: [...pedido.articulos, {
      clave: '3', identificadorDetalle: '3', codigo: 'A3', descripcion: 'Tercer artículo',
      cantidad: 1, codigoAlmacen: 'BSPS01',
    }] };
    fixture.componentRef.setInput('pedido', tres);
    fixture.detectChanges();
    return tres;
  }

  function imprimirYTerminarDialogo(indices = [0, 1]): void {
    vi.useFakeTimers();
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const componente = fixture.componentInstance;
    indices.forEach((indice) => componente.alternarSeleccion(componente.pedido!.articulos[indice]!, true));
    componente.imprimirSeleccionados();
    vi.runAllTimers();
    window.dispatchEvent(new Event('afterprint'));
    fixture.detectChanges();
  }

  it('No después de cancelar la impresión nativa no registra ni marca líneas y conserva selección', () => {
    prepararTresArticulos();
    imprimirYTerminarDialogo();
    fixture.nativeElement.querySelector('dialog .boton-secundario').click();
    fixture.detectChanges();
    expect(registrarImpresiones).not.toHaveBeenCalled();
    expect(fixture.componentInstance.lineasImpresas().size).toBe(0);
    expect(fixture.componentInstance.lineasSeleccionadas().size).toBe(2);
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
  });

  it('confirma únicamente dos de tres líneas con código, fecha y usuario; permite reimpresión', () => {
    const tres = prepararTresArticulos();
    let cantidad = 0;
    registrarImpresiones.mockImplementation((lineas: { idOrigen: string; identificadorDetalle: string }[]) => {
      cantidad++;
      return of({ datos: lineas.map((linea) => ({ ...linea, cantidadImpresiones: cantidad,
        ultimaImpresionEn: '2026-09-16T21:52:00.000Z', ultimaImpresionPor: 'Jorge Lara' })) });
    });
    imprimirYTerminarDialogo();
    fixture.nativeElement.querySelector('dialog .boton-primario').click();
    fixture.detectChanges();
    expect(registrarImpresiones).toHaveBeenCalledWith(tres.articulos.slice(0, 2).map((articulo) => ({
      idOrigen: tres.idOrigen, identificadorDetalle: articulo.identificadorDetalle, codigoArticulo: articulo.codigo,
    })));
    expect(fixture.componentInstance.lineasImpresas().size).toBe(2);
    expect(fixture.componentInstance.estaImpreso(tres.articulos[2]!)).toBe(false);
    expect(fixture.componentInstance.lineasSeleccionadas().size).toBe(0);
    expect(fixture.componentInstance.informacionImpresion(tres.articulos[0]!)).toContain('Jorge Lara');
    imprimirYTerminarDialogo([0]);
    fixture.componentInstance.registrarImpresionConfirmada();
    fixture.detectChanges();
    expect(registrarImpresiones).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.informacionImpresion(tres.articulos[0]!)).toContain('Impresiones: 2');
    expect(fixture.componentInstance.estaImpreso(tres.articulos[2]!)).toBe(false);
  });

  it('No en una reimpresión conserva el estado impreso anterior', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.detectChanges();
    imprimirYTerminarDialogo([0]);
    fixture.componentInstance.descartarRegistroImpresion();
    expect(fixture.componentInstance.estaImpreso(pedido.articulos[0]!)).toBe(true);
    expect(registrarImpresiones).not.toHaveBeenCalled();
  });

  it('ESC equivale a No, sin registrar; afterprint ajeno no abre confirmación', () => {
    prepararTresArticulos();
    window.dispatchEvent(new Event('afterprint'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(false);
    imprimirYTerminarDialogo();
    const cancelar = new Event('cancel', { cancelable: true });
    fixture.nativeElement.querySelector('dialog').dispatchEvent(cancelar);
    fixture.detectChanges();
    expect(cancelar.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.confirmarImpresion()).toBe(false);
    expect(registrarImpresiones).not.toHaveBeenCalled();
  });

  it('error de registro no marca impreso y permite reintentar sin duplicar clics simultáneos', () => {
    prepararTresArticulos();
    imprimirYTerminarDialogo();
    registrarImpresiones.mockReturnValueOnce(throwError(() => new Error('503')));
    fixture.componentInstance.registrarImpresionConfirmada();
    fixture.detectChanges();
    expect(fixture.componentInstance.lineasImpresas().size).toBe(0);
    expect(fixture.nativeElement.querySelector('dialog [role="alert"]')).toBeTruthy();
    const respuesta = new Subject<{ datos: never[] }>();
    registrarImpresiones.mockReturnValue(respuesta);
    fixture.componentInstance.registrarImpresionConfirmada();
    fixture.componentInstance.registrarImpresionConfirmada();
    expect(registrarImpresiones).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.guardandoImpresion()).toBe(true);
    respuesta.next({ datos: [] });
    expect(fixture.componentInstance.confirmarImpresion()).toBe(false);
  });

  it('el refresco conserva el lote original y una consulta vieja no deshace el registro', () => {
    const tres = prepararTresArticulos();
    imprimirYTerminarDialogo();
    const consultaVieja = new Subject<{ datos: never[] }>();
    consultarImpresiones.mockReturnValue(consultaVieja);
    fixture.componentRef.setInput('pedido', { ...tres, articulos: tres.articulos.map((a) => ({ ...a, codigo: 'MODIFICADO' })) });
    fixture.detectChanges();
    fixture.componentInstance.registrarImpresionConfirmada();
    consultaVieja.next({ datos: [] });
    expect(registrarImpresiones.mock.calls[0]![0][0].codigoArticulo).toBe(tres.articulos[0]!.codigo);
    expect(fixture.componentInstance.estaImpreso(tres.articulos[1]!)).toBe(true);
  });

  it('cambiar de pedido descarta la confirmación para no registrar otro pedido', () => {
    prepararTresArticulos();
    imprimirYTerminarDialogo();
    fixture.componentRef.setInput('pedido', { ...pedido, idOrigen: 'SAP:999' });
    fixture.detectChanges();
    fixture.componentInstance.registrarImpresionConfirmada();
    expect(registrarImpresiones).not.toHaveBeenCalled();
    expect(fixture.componentInstance.confirmarImpresion()).toBe(false);
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
