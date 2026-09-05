import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { HistorialComponent } from './historial.component';
import { HistorialService } from './historial.service';

describe('HistorialComponent', () => {
  it('muestra chips desde el filtro real y sincroniza su eliminación', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const buscar = vi.fn().mockReturnValue(of({
      datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 0, hayMas: false },
    }));
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar, buscarArticulos: buscar, obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn().mockReturnValue(of({ datos: [
          { codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega 3', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
          { codigoAlmacen: 'BSPS04', nombreAlmacen: 'Bodega 4', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
        ] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true), navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const componente = fixture.componentInstance;
    componente.alternarAlmacen('BSPS03', true);
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ codigosAlmacen: ['BSPS03'] }));
    componente.alternarAlmacen('BSPS04', true);
    expect(componente.filtros.codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: ['BSPS03', 'BSPS04'],
    }));
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const chips = [...fixture.nativeElement.querySelectorAll('.etiqueta-almacen')]
      .map((elemento: HTMLElement) => elemento.textContent?.trim());
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('BSPS03'), expect.stringContaining('BSPS04')]));

    (fixture.nativeElement.querySelector('[aria-label="Quitar Bodega 4"]') as HTMLButtonElement).click();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(componente.filtros.codigosAlmacen).toEqual(['BSPS03']);
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(['BSPS03']);
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ codigosAlmacen: ['BSPS03'] }));
    fixture.destroy();
    vi.useRealTimers();
  });
});
