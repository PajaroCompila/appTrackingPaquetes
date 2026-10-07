import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrasladosComponent } from './traslados.component';

describe('TrasladosComponent', () => {
  let fixture: ComponentFixture<TrasladosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TrasladosComponent] }).compileComponents();
    fixture = TestBed.createComponent(TrasladosComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('presenta el placeholder corporativo del módulo', () => {
    const contenido = fixture.nativeElement.textContent as string;
    const ilustracion = fixture.nativeElement.querySelector('.ilustracion-construccion svg') as SVGElement;

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Traslados');
    expect(contenido).toContain('Módulo de traslados entre bodegas');
    expect(contenido).toContain('Módulo en construcción');
    expect(contenido).toContain('Próximamente estará disponible');
    expect(ilustracion.getAttribute('viewBox')).toBe('0 0 760 380');
    expect(fixture.nativeElement.querySelector('.carga-grua')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('form, table, button, input')).toBeNull();
  });
});
