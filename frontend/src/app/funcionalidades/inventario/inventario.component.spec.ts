import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ConsultaInventarioArticuloService } from '../../compartido/inventario/consulta-inventario-articulo.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { InventarioComponent } from './inventario.component';

describe('InventarioComponent', () => {
  let fixture: ComponentFixture<InventarioComponent>;
  const buscarArticulosInventario = vi.fn();
  const abrir = vi.fn();
  const coincidencias = [
    { codigoArticulo: 'YAM-MODX7', descripcion: 'Sintetizador 76 teclas' },
    { codigoArticulo: 'YAM-PSR', descripcion: 'Teclado portátil' },
  ];

  beforeEach(async () => {
    vi.useFakeTimers();
    buscarArticulosInventario.mockReset().mockReturnValue(of({ datos: coincidencias }));
    abrir.mockReset();
    await TestBed.configureTestingModule({
      imports: [InventarioComponent],
      providers: [
        { provide: PedidosService, useValue: { buscarArticulosInventario } },
        { provide: ConsultaInventarioArticuloService, useValue: { abrir } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InventarioComponent);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
  });

  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });

  it('inicia enfocado y explica la búsqueda por código o descripción', () => {
    expect(document.activeElement?.getAttribute('id')).toBe('terminoInventario');
    expect(fixture.nativeElement.textContent).toContain('código o descripción');
    expect(fixture.nativeElement.textContent).toContain('Los resultados aparecerán automáticamente');
  });

  it('espera dos caracteres y busca coincidencias después de una pausa breve', async () => {
    fixture.componentInstance.terminoBusqueda = 'y';
    fixture.componentInstance.alCambiarTermino('y');
    await vi.advanceTimersByTimeAsync(300);
    expect(buscarArticulosInventario).not.toHaveBeenCalled();
    fixture.componentInstance.terminoBusqueda = 'yam';
    fixture.componentInstance.alCambiarTermino('yam');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(buscarArticulosInventario).toHaveBeenCalledWith('yam');
    expect(fixture.nativeElement.querySelectorAll('.resultado-articulo')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Sintetizador 76 teclas');
  });

  it('abre el modal compartido al seleccionar una coincidencia', async () => {
    fixture.componentInstance.terminoBusqueda = 'yam';
    fixture.componentInstance.alCambiarTermino('yam');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.resultado-articulo') as HTMLButtonElement).click();
    expect(abrir).toHaveBeenCalledWith('YAM-MODX7', undefined);
    expect(fixture.componentInstance.terminoBusqueda).toBe('YAM-MODX7');
  });

  it('permite recorrer resultados con el teclado y abrir el activo con ENTER', async () => {
    fixture.componentInstance.terminoBusqueda = 'yam';
    fixture.componentInstance.alCambiarTermino('yam');
    await vi.advanceTimersByTimeAsync(250);
    fixture.componentInstance.manejarTeclado(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.componentInstance.manejarTeclado(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.componentInstance.buscar();
    expect(abrir).toHaveBeenCalledWith('YAM-PSR', undefined);
  });

  it('distingue ausencia de coincidencias de una falla temporal', async () => {
    buscarArticulosInventario.mockReturnValueOnce(of({ datos: [] }));
    fixture.componentInstance.terminoBusqueda = 'ninguno';
    fixture.componentInstance.alCambiarTermino('ninguno');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin coincidencias');
    buscarArticulosInventario.mockReturnValueOnce(throwError(() => ({ status: 503 })));
    fixture.componentInstance.terminoBusqueda = 'error';
    fixture.componentInstance.alCambiarTermino('error');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos buscar artículos');
  });
});
