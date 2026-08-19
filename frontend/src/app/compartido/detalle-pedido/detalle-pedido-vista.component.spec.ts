import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from './detalle-pedido-vista.interface';
import { DetallePedidoVistaComponent } from './detalle-pedido-vista.component';

describe('DetallePedidoVistaComponent', () => {
  let fixture: ComponentFixture<DetallePedidoVistaComponent>;
  const configuracion: ConfiguracionDetallePedido = {
    contexto: 'Consulta', titulo: 'Detalle del pedido', descripcion: 'Descripción contextual',
    etiquetaEstado: 'Pendiente', severidadEstado: 'advertencia',
    etiquetaRetorno: 'Regresar al listado', tituloInformacion: 'Información operativa',
    etiquetaArticulos: 'Artículos del pedido', soloConsulta: true,
  };
  const pedido: PedidoDetalleVisual = {
    numeroPedido: '001234', vendedor: null, fechaPedido: '2026-08-06T12:30:00', bodega: null,
    datosOperativos: [
      { etiqueta: 'Usuario', valor: null, icono: 'pi pi-user' },
      { etiqueta: 'Fecha', valor: '2026-08-06T13:00:00', icono: 'pi pi-calendar', esFecha: true },
    ],
    articulos: [
      { clave: '1', codigo: 'ARTICULO-CODIGO-EXTENSO-001', descripcion: 'Descripción extensa que debe conservarse completa y ajustarse dentro de la celda.', cantidad: 2, codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega original' },
      { clave: '2', codigo: 'A2', descripcion: 'Segundo artículo', cantidad: 1, codigoAlmacen: 'BTGU01' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetallePedidoVistaComponent] }).compileComponents();
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
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
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
