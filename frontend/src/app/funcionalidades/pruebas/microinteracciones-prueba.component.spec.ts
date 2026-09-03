import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MicrointeraccionesPruebaComponent } from './microinteracciones-prueba.component';

describe('MicrointeraccionesPruebaComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [MicrointeraccionesPruebaComponent],
    providers: [provideRouter([])],
  }));

  it('presenta las muestras sin consultar datos operativos', () => {
    const fixture = TestBed.createComponent(MicrointeraccionesPruebaComponent);
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Microinteracciones');
    expect(texto).toContain('Pedidos pendientes');
    expect(texto).toContain('Botones y campos');
    expect(texto).toContain('Pestañas, tabla y actualización');
  });

  it('permite probar pestañas y modal', () => {
    const fixture = TestBed.createComponent(MicrointeraccionesPruebaComponent);
    fixture.detectChanges();
    const componente = fixture.componentInstance;

    componente.seleccionarPestana('articulos');
    componente.modalAbierto.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]')?.textContent)
      .toContain('Artículos');
  });
});
