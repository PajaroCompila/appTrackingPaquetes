import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PedidosService } from './pedidos.service';
import { DialogoInventarioArticuloComponent } from './dialogo-inventario-articulo.component';

describe('DialogoInventarioArticuloComponent', () => {
  let fixture: ComponentFixture<DialogoInventarioArticuloComponent>;
  const inventario = {
    codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B1',
    nombreAlmacen: 'Bodega', existenciaFisica: 0,
    existencias: [
      { codigoAlmacen: 'B2', nombreAlmacen: 'Bodega baja', existenciaFisica: 9 },
      { codigoAlmacen: 'B3', nombreAlmacen: 'Bodega disponible', existenciaFisica: 10 },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogoInventarioArticuloComponent],
      providers: [{
        provide: PedidosService,
        useValue: { obtenerUrlImagenArticulo: vi.fn().mockReturnValue('/api/articulos/A1/imagen') },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialogoInventarioArticuloComponent);
    fixture.componentRef.setInput('estado', 'datos');
    fixture.componentRef.setInput('inventario', inventario);
    fixture.detectChanges();
  });

  it('presenta los datos, existencias y carga la fotografía en segundo plano', () => {
    const imagen = fixture.nativeElement.querySelector('.previsualizacion-articulo img') as HTMLImageElement;
    expect(imagen.getAttribute('src')).toBe('/api/articulos/A1/imagen');
    expect(fixture.nativeElement.textContent).toContain('Cargando imagen');

    imagen.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(fixture.componentInstance.estadoImagen).toBe('disponible');
    expect(imagen.classList).toContain('imagen-visible');
    expect(fixture.nativeElement.textContent).toContain('0 unidades');
    expect(fixture.nativeElement.textContent).toContain('Bodega baja');
    expect(fixture.nativeElement.textContent).toContain('19 unidades');
    expect(fixture.nativeElement.querySelectorAll('.bodegas-inventario li')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.existencia-baja')).toHaveLength(1);
  });

  it('abre la imagen con doble clic y Escape cierra primero solo el visor', () => {
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);
    const imagen = fixture.nativeElement.querySelector('.previsualizacion-articulo img') as HTMLImageElement;
    imagen.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    imagen.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fondo-visor-imagen')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fondo-visor-imagen')).toBeNull();
    expect(cerrar).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it('la X del visor conserva abierto el modal de inventario', () => {
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);
    const imagen = fixture.nativeElement.querySelector('.previsualizacion-articulo img') as HTMLImageElement;
    imagen.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    imagen.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.cerrar-visor') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fondo-visor-imagen')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dialogo-inventario')).toBeTruthy();
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('muestra un estado limpio cuando SAP no tiene fotografía', () => {
    const imagen = fixture.nativeElement.querySelector('.previsualizacion-articulo img') as HTMLImageElement;
    imagen.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Imagen no disponible');
    expect(fixture.nativeElement.querySelector('.previsualizacion-articulo img')).toBeNull();
    expect(fixture.componentInstance.visorImagenAbierto).toBe(false);
  });

  it('cierra el modal con su X y con el botón Cerrar', () => {
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);

    (fixture.nativeElement.querySelector('.cerrar-icono') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('footer button') as HTMLButtonElement).click();

    expect(cerrar).toHaveBeenCalledTimes(2);
  });
});
