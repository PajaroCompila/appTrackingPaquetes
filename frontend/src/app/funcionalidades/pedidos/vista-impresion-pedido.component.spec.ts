import { TestBed } from '@angular/core/testing';
import { VistaImpresionPedidoComponent } from './vista-impresion-pedido.component';

describe('VistaImpresionPedidoComponent', () => {
  it('genera una sola tabla con datos principales y descripción legible por artículo', () => {
    const fixture = TestBed.createComponent(VistaImpresionPedidoComponent);
    fixture.componentRef.setInput('articulos', [
      { codigo: 'A-001', descripcion: 'Descripción extensa completa que puede ocupar varias líneas sin cortarse', cantidad: 1.5, bodega: 'BSPS02' },
      { codigo: 'A-002', descripcion: 'Segundo artículo', cantidad: 2, bodega: 'TSPS01' },
    ]);
    fixture.componentRef.setInput('fechaHora', '04/08/2026 01:30:45 p. m.');
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelectorAll('table')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.encabezado-impresion img')?.getAttribute('src'))
      .toBe('/imagenes/logo-pajaro-azul.png');
    expect(fixture.nativeElement.querySelectorAll('thead')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('thead th')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('caption')?.textContent).toContain('04/08/2026');
    expect(fixture.nativeElement.querySelectorAll('tbody')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.datos-principales')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.fila-descripcion')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.fila-descripcion td')?.colSpan).toBe(3);
    expect(texto.match(/CÓDIGO/g)).toHaveLength(1);
    expect(texto).toContain('A-001');
    expect(texto).toContain('Descripción extensa completa que puede ocupar varias líneas sin cortarse');
    expect(texto).toContain('1.5');
    expect(texto).toContain('BSPS02');
    expect(texto).not.toContain('VENDEDOR');
    expect(texto).not.toContain('PRECIO');
  });
});
