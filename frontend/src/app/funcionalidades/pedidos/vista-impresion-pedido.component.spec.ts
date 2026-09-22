import { TestBed } from '@angular/core/testing';
import { VistaImpresionPedidoComponent } from './vista-impresion-pedido.component';

describe('VistaImpresionPedidoComponent', () => {
  it('imprime fecha, pedido, vendedor, responsable y artículos sin alterar sus datos', () => {
    const fixture = TestBed.createComponent(VistaImpresionPedidoComponent);
    fixture.componentRef.setInput('articulos', [
      { idPedido: 'R1:1', numeroPedido: '1001', codigo: 'A-001',
        descripcion: 'Descripción extensa completa que puede ocupar varias líneas sin cortarse',
        cantidad: 1.5, bodega: 'BSPS02', vendedor: 'Juan Pérez', asignadoA: 'Jorge Lara' },
      { idPedido: 'R1:1', numeroPedido: '1001', codigo: 'A-002',
        descripcion: 'Segundo artículo', cantidad: 2, bodega: 'TSPS01',
        vendedor: 'Juan Pérez', asignadoA: 'Jorge Lara' },
    ]);
    fixture.componentRef.setInput('fechaHora', '04/08/2026 01:30:45 p. m.');
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(fixture.nativeElement.querySelectorAll('table')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.encabezado-impresion img')?.getAttribute('src'))
      .toBe('/imagenes/logo-pajaro-azul.png');
    expect(fixture.nativeElement.querySelector('.fecha-impresion')?.textContent).toContain('04/08/2026');
    expect(fixture.nativeElement.querySelector('.datos-pedido')?.textContent).toContain('Pedido: 1001');
    expect(fixture.nativeElement.querySelector('.vendedor-impresion')?.textContent).toContain('Juan Pérez');
    expect(fixture.nativeElement.querySelector('.asignado-impresion strong')?.textContent).toContain('Jorge Lara');
    expect(fixture.nativeElement.querySelector('.encabezado-cantidad')?.textContent).toBe('CANT.');
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
    expect(texto).not.toContain('PRECIO');
  });

  it('agrupa por pedido, conserva vendedores separados y ordena cada grupo por bodega', () => {
    const fixture = TestBed.createComponent(VistaImpresionPedidoComponent);
    fixture.componentRef.setInput('articulos', [
      { idPedido: 'R1:1', numeroPedido: '1001', codigo: 'P1-B2', descripcion: 'Uno', cantidad: 1,
        bodega: 'BSPS02', vendedor: 'Juan Pérez', asignadoA: 'Jorge Lara' },
      { idPedido: 'R1:2', numeroPedido: '1002', codigo: 'P2-B5', descripcion: 'Dos', cantidad: 2,
        bodega: 'BSPS05', vendedor: 'Carlos López', asignadoA: 'Jorge Lara' },
      { idPedido: 'R1:1', numeroPedido: '1001', codigo: 'P1-B1', descripcion: 'Tres', cantidad: 3,
        bodega: 'BSPS01', vendedor: 'Juan Pérez', asignadoA: 'Jorge Lara' },
      { idPedido: 'R1:3', numeroPedido: '1003', codigo: 'P3-B4', descripcion: 'Cuatro', cantidad: 4,
        bodega: 'BSPS04', vendedor: 'Juan Pérez', asignadoA: 'Jorge Lara' },
      { idPedido: 'R1:2', numeroPedido: '1002', codigo: 'P2-B1', descripcion: 'Cinco', cantidad: 5,
        bodega: 'BSPS01', vendedor: 'Carlos López', asignadoA: 'Jorge Lara' },
    ]);
    fixture.detectChanges();
    const grupos = [...fixture.nativeElement.querySelectorAll('.pedido-impreso')] as HTMLElement[];

    expect(grupos).toHaveLength(3);
    expect(grupos.map((grupo) => grupo.querySelector('.datos-pedido')?.textContent))
      .toEqual([
        expect.stringContaining('Pedido: 1001'),
        expect.stringContaining('Pedido: 1002'),
        expect.stringContaining('Pedido: 1003'),
      ]);
    expect(grupos[0]?.querySelector('.vendedor-impresion')?.textContent).toContain('Juan Pérez');
    expect(grupos[1]?.querySelector('.vendedor-impresion')?.textContent).toContain('Carlos López');
    expect(grupos[2]?.querySelector('.vendedor-impresion')?.textContent).toContain('Juan Pérez');
    expect(fixture.nativeElement.querySelectorAll('.asignado-impresion')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.encabezado-cantidad')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.articulo-impreso')).toHaveLength(5);
    expect(grupos[0]!.textContent!.indexOf('P1-B1')).toBeLessThan(grupos[0]!.textContent!.indexOf('P1-B2'));
    expect(grupos[1]!.textContent!.indexOf('P2-B1')).toBeLessThan(grupos[1]!.textContent!.indexOf('P2-B5'));
    expect(grupos[0]?.textContent).not.toContain('P2-B1');
    expect(grupos[1]?.textContent).not.toContain('P1-B1');
  });

  it('usa valores neutros cuando el pedido no tiene vendedor ni responsable', () => {
    const fixture = TestBed.createComponent(VistaImpresionPedidoComponent);
    fixture.componentRef.setInput('articulos', [
      { idPedido: 'R1:1', numeroPedido: '1001', codigo: 'A-001',
        descripcion: 'Artículo', cantidad: 1, bodega: 'BSPS02' },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.vendedor-impresion')?.textContent).toContain('Sin vendedor');
    expect(fixture.nativeElement.querySelector('.asignado-impresion')?.textContent).toContain('Sin asignar');
  });
});
