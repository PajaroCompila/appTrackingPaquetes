import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PedidosService } from './pedidos.service';
import { DialogoInventarioArticuloComponent } from './dialogo-inventario-articulo.component';

describe('DialogoInventarioArticuloComponent', () => {
  let fixture: ComponentFixture<DialogoInventarioArticuloComponent>;
  const inventario = {
    codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B1',
    nombreAlmacen: 'Bodega', existenciaFisica: 0,
    ultimaFechaIngreso: '2026-10-03', ultimaCantidadIngreso: 6,
    existencias: [
      { codigoAlmacen: 'B0', nombreAlmacen: 'Bodega sin existencia', existenciaFisica: 0 },
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
    expect(fixture.nativeElement.querySelectorAll('.bodegas-inventario li')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.sin-existencia')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.existencia-baja')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.sin-existencia')?.textContent).toContain('Sin existencia');
    expect(fixture.nativeElement.querySelector('.sin-existencia .cantidad-bodega strong')?.textContent)
      .toContain('0');
    expect(fixture.nativeElement.querySelector('.sin-existencia .cantidad-bodega > span')?.textContent)
      .toContain('unidades');
    expect(fixture.nativeElement.querySelector('.existencia-baja')?.textContent).toContain('Existencia baja');
    expect(fixture.nativeElement.querySelector('.sin-existencia.existencia-baja')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('03/10/2026');
    expect(fixture.nativeElement.textContent).toContain('6 unidades');
    expect(fixture.nativeElement.textContent).not.toMatch(/proveedor|CardCode|CardName/i);
  });

  it('muestra código y descripción juntos en el encabezado de cada bodega', () => {
    const encabezados = Array.from(
      fixture.nativeElement.querySelectorAll('.identidad-bodega strong') as NodeListOf<HTMLElement>,
      (elemento) => elemento.textContent?.trim(),
    );

    expect(encabezados).toEqual([
      'B0 - Bodega sin existencia',
      'B2 - Bodega baja',
      'B3 - Bodega disponible',
    ]);
    expect(fixture.nativeElement.querySelectorAll('.identidad-bodega > div > span')).toHaveLength(0);
  });

  it('muestra Sin registro cuando SAP no tiene movimientos de entrada', () => {
    fixture.componentRef.setInput('inventario', {
      ...inventario, ultimaFechaIngreso: '2026-10-03', ultimaCantidadIngreso: Number.NaN,
    });
    fixture.detectChanges();

    const datos = fixture.nativeElement.querySelectorAll('.datos-ultimo-ingreso dd');
    expect(datos).toHaveLength(2);
    expect(datos[0].textContent).toContain('Sin registro');
    expect(datos[1].textContent).toContain('Sin registro');
    expect(fixture.nativeElement.textContent).not.toMatch(/NaN|undefined|null/);
  });

  it('mantiene separados el encabezado, la fotografía y el texto de ayuda', () => {
    const tarjeta = fixture.nativeElement.querySelector('.previsualizacion-articulo') as HTMLElement;
    const imagen = tarjeta.querySelector('img') as HTMLImageElement;
    imagen.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(tarjeta.children[0].id).toBe('titulo-imagen-articulo');
    expect(tarjeta.children[1].classList).toContain('contenedor-imagen-articulo');
    expect(tarjeta.children[2].tagName).toBe('SMALL');
    expect(tarjeta.children[2].textContent).toContain('Clic para ampliar');
  });

  it('abre la imagen con un clic y Escape cierra primero solo el visor', () => {
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);
    const imagen = fixture.nativeElement.querySelector('.previsualizacion-articulo img') as HTMLImageElement;
    imagen.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    imagen.click();
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
    imagen.click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.cerrar-visor') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fondo-visor-imagen')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dialogo-inventario')).toBeTruthy();
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('cierra la imagen ampliada con un clic y conserva abierto el modal de inventario', () => {
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);
    const imagen = fixture.nativeElement.querySelector('.previsualizacion-articulo img') as HTMLImageElement;
    imagen.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    imagen.click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.visor-imagen img') as HTMLImageElement).click();
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

  it('elimina el manejo de Escape al destruir el componente', () => {
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);

    fixture.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cerrar).not.toHaveBeenCalled();
  });
});
