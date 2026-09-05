import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CodigoArticuloInventarioDirective } from './codigo-articulo-inventario.directive';
import { ConsultaInventarioArticuloService } from './consulta-inventario-articulo.service';

@Component({
  imports: [CodigoArticuloInventarioDirective],
  template: `
    <span
      title="Doble clic para consultar inventario"
      [appCodigoArticuloInventario]="codigo"
      [codigoAlmacenInventario]="almacen"
    >CÓDIGO RECORTADO…</span>
  `,
})
class ComponentePrueba {
  public codigo: string | null = 'COSMIC-SQ41-CODIGO-COMPLETO';
  public almacen: string | null = 'BSPS05';
}

describe('CodigoArticuloInventarioDirective', () => {
  let fixture: ComponentFixture<ComponentePrueba>;
  let abrir: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    abrir = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ComponentePrueba],
      providers: [{ provide: ConsultaInventarioArticuloService, useValue: { abrir } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ComponentePrueba);
  });

  it('envía el código completo y el almacén de la fila con doble clic', () => {
    fixture.detectChanges();
    const codigo = fixture.nativeElement.querySelector('span') as HTMLElement;
    codigo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(abrir).toHaveBeenCalledWith('COSMIC-SQ41-CODIGO-COMPLETO', 'BSPS05');
    expect(codigo.textContent).toContain('RECORTADO');
    expect(codigo.getAttribute('title')).toBe('Doble clic para consultar inventario');
  });

  it('permite consultar con Enter y ofrece nombre accesible', () => {
    fixture.detectChanges();
    const codigo = fixture.nativeElement.querySelector('span') as HTMLElement;
    codigo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(abrir).toHaveBeenCalledWith('COSMIC-SQ41-CODIGO-COMPLETO', 'BSPS05');
    expect(codigo.getAttribute('role')).toBe('button');
    expect(codigo.tabIndex).toBe(0);
    expect(codigo.getAttribute('aria-label')).toContain('COSMIC-SQ41-CODIGO-COMPLETO');
  });

  it('no inventa una bodega cuando la fila no la contiene', () => {
    fixture.componentInstance.almacen = null;
    fixture.detectChanges();
    const codigo = fixture.nativeElement.querySelector('span') as HTMLElement;
    codigo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(abrir).not.toHaveBeenCalled();
    expect(codigo.getAttribute('role')).toBeNull();
    expect(codigo.getAttribute('tabindex')).toBeNull();
  });
});
