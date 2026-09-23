import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { ArticuloImpresionPedido } from './vista-impresion-pedido.component';

export interface LineaImpresionPedidoPos {
  idPedido: string;
  numeroPedido: string | null | undefined;
  codigo: string | null | undefined;
  descripcion: string | null | undefined;
  cantidad: number | null;
  bodega: string | null | undefined;
  vendedor?: string | null;
  asignadoA?: string | null;
}

const claseImpresionActiva = 'impresion-pedido-pos-activa';

@Injectable({ providedIn: 'root' })
export class ImpresionPedidoPosService {
  private readonly documento = inject(DOCUMENT);

  public preparar(lineas: readonly LineaImpresionPedidoPos[]): ArticuloImpresionPedido[] {
    return lineas.map((linea) => ({
      idPedido: linea.idPedido,
      numeroPedido: linea.numeroPedido?.trim() || '—',
      codigo: linea.codigo?.trim() || '—',
      descripcion: linea.descripcion?.trim() || '—',
      cantidad: linea.cantidad,
      bodega: linea.bodega?.trim() || '—',
      vendedor: linea.vendedor?.trim() || 'Sin vendedor',
      asignadoA: linea.asignadoA?.trim() || 'Sin asignar',
    }));
  }

  public imprimir(): void {
    this.documento.body?.classList.add(claseImpresionActiva);
    try {
      window.print();
    } catch (error) {
      this.finalizar();
      throw error;
    }
  }

  public finalizar(): void {
    this.documento.body?.classList.remove(claseImpresionActiva);
  }
}
