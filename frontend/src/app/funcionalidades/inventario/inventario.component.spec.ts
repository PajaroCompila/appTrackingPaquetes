import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PedidosService } from '../pedidos/pedidos.service';
import { InventarioComponent } from './inventario.component';

describe('InventarioComponent', () => {
  let fixture: ComponentFixture<InventarioComponent>;
  const obtenerInventarioArticulo = vi.fn();
  const inventario = {
    codigoArticulo: 'ART-001', descripcion: 'Artículo de prueba',
    codigoAlmacen: 'B1', nombreAlmacen: 'Bodega uno', existenciaFisica: 0,
    existencias: [
      { codigoAlmacen: 'B1', nombreAlmacen: 'Bodega uno', existenciaFisica: 0 },
      { codigoAlmacen: 'B2', nombreAlmacen: 'Bodega dos', existenciaFisica: 6 },
      { codigoAlmacen: 'B3', nombreAlmacen: 'Bodega tres', existenciaFisica: 20 },
    ],
  };

  beforeEach(async () => {
    obtenerInventarioArticulo.mockReset().mockReturnValue(of(inventario));
    await TestBed.configureTestingModule({
      imports: [InventarioComponent],
      providers: [
        provideHttpClient(),
        { provide: PedidosService, useValue: { obtenerInventarioArticulo } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InventarioComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('inicia con el buscador enfocado y sin una tabla vacía', async () => {
    await new Promise((resolver) => setTimeout(resolver));
    expect(document.activeElement?.getAttribute('id')).toBe('codigoArticuloInventario');
    expect(fixture.nativeElement.textContent).toContain('Busque un artículo');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('consulta con el botón usando el endpoint existente y muestra existencias reales', () => {
    fixture.componentInstance.codigoArticulo = ' ART-001 ';
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.boton-buscar') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(obtenerInventarioArticulo).toHaveBeenCalledWith('ART-001');
    expect(fixture.nativeElement.textContent).toContain('Artículo encontrado');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.sin-existencia')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.existencia-baja')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.con-existencia')).not.toBeNull();
  });

  it('consulta al enviar el formulario, equivalente a presionar ENTER', () => {
    fixture.componentInstance.codigoArticulo = 'ART-ENTER';
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(obtenerInventarioArticulo).toHaveBeenCalledWith('ART-ENTER');
  });

  it('distingue un código inexistente de una falla de consulta', () => {
    obtenerInventarioArticulo.mockReturnValueOnce(throwError(() => ({ status: 404 })));
    fixture.componentInstance.codigoArticulo = 'NO-EXISTE';
    fixture.componentInstance.buscar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se encontró el artículo');

    obtenerInventarioArticulo.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    fixture.componentInstance.codigoArticulo = 'ERROR-SAP';
    fixture.componentInstance.buscar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos consultar el inventario');
  });

  it('presenta un artículo válido aunque todas sus existencias sean cero', () => {
    obtenerInventarioArticulo.mockReturnValueOnce(of({ ...inventario, existencias: [
      { codigoAlmacen: 'B1', nombreAlmacen: 'Bodega uno', existenciaFisica: 0 },
    ] }));
    fixture.componentInstance.codigoArticulo = 'ART-CERO';
    fixture.componentInstance.buscar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Artículo encontrado');
    expect(fixture.nativeElement.textContent).toContain('Existencia total');
    expect(fixture.nativeElement.querySelector('.sin-existencia')).not.toBeNull();
  });
});
