import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginacionComponent } from './paginacion.component';

describe('PaginacionComponent', () => {
  let fixture: ComponentFixture<PaginacionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaginacionComponent] }).compileComponents();
    fixture = TestBed.createComponent(PaginacionComponent);
    fixture.componentRef.setInput('paginaActual', 6);
    fixture.componentRef.setInput('totalRegistros', 300);
    fixture.componentRef.setInput('cantidadPorPagina', 25);
    fixture.detectChanges();
  });

  it('muestra la página actual, el total y accesos numerados', () => {
    expect(fixture.nativeElement.textContent).toContain('Página 6 de 12');
    expect(fixture.nativeElement.querySelector('[aria-current="page"]')?.textContent.trim()).toBe('6');
    expect(fixture.nativeElement.textContent).toContain('…');
  });

  it('emite la página elegida', () => {
    const emitir = vi.spyOn(fixture.componentInstance.paginaSeleccionada, 'emit');
    const paginaSiete = [...fixture.nativeElement.querySelectorAll('.numero-pagina')]
      .find((boton: HTMLButtonElement) => boton.textContent?.trim() === '7') as HTMLButtonElement;
    paginaSiete.click();
    expect(emitir).toHaveBeenCalledWith(7);
  });
});
