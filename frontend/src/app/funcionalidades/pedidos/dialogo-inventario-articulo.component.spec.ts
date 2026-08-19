import { TestBed } from '@angular/core/testing';
import { DialogoInventarioArticuloComponent } from './dialogo-inventario-articulo.component';

describe('DialogoInventarioArticuloComponent', () => {
  it('cierra con Escape, botón X y botón Cerrar', () => {
    const fixture = TestBed.createComponent(DialogoInventarioArticuloComponent);
    fixture.componentRef.setInput('estado', 'datos');
    fixture.componentRef.setInput('inventario', {
      codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B1',
      nombreAlmacen: 'Bodega', existenciaFisica: 0,
      existencias: [
        { codigoAlmacen: 'B2', nombreAlmacen: 'Bodega baja', existenciaFisica: 9 },
        { codigoAlmacen: 'B3', nombreAlmacen: 'Bodega disponible', existenciaFisica: 10 },
      ],
    });
    const cerrar = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrar);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const botones = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    botones[0]?.click();
    botones[1]?.click();
    expect(cerrar).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.textContent).toContain('0 unidades');
    expect(fixture.nativeElement.textContent).toContain('Bodega baja');
    expect(fixture.nativeElement.textContent).toContain('19 unidades');
    expect(fixture.nativeElement.querySelectorAll('.bodegas-inventario li')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.existencia-baja')).toHaveLength(1);
  });
});
