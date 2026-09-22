import { Component, Input } from '@angular/core';

export interface ArticuloImpresionPedido {
  idPedido: string;
  numeroPedido: string;
  codigo: string;
  descripcion: string;
  cantidad: number | null;
  bodega: string;
  vendedor?: string | null;
  asignadoA?: string | null;
}

interface GrupoImpresionPedido {
  idPedido: string;
  numeroPedido: string;
  vendedor: string;
  articulos: ArticuloImpresionPedido[];
}

@Component({
  selector: 'app-vista-impresion-pedido',
  templateUrl: './vista-impresion-pedido.component.html',
  styleUrl: './vista-impresion-pedido.component.css',
})
export class VistaImpresionPedidoComponent {
  @Input({ required: true }) public articulos: readonly ArticuloImpresionPedido[] = [];
  @Input() public fechaHora = '';

  public responsables(): string {
    return this.resumirPersonas(this.articulos.map(({ asignadoA }) => asignadoA), 'Sin asignar');
  }

  public pedidosAgrupados(): GrupoImpresionPedido[] {
    const grupos = new Map<string, GrupoImpresionPedido>();
    this.articulos.forEach((articulo) => {
      let grupo = grupos.get(articulo.idPedido);
      if (!grupo) {
        grupo = {
          idPedido: articulo.idPedido,
          numeroPedido: articulo.numeroPedido.trim() || '—',
          vendedor: articulo.vendedor?.trim() || 'Sin vendedor',
          articulos: [],
        };
        grupos.set(articulo.idPedido, grupo);
      }
      grupo.articulos.push(articulo);
    });
    return [...grupos.values()].map((grupo) => ({
      ...grupo,
      articulos: grupo.articulos
        .map((articulo, indice) => ({ articulo, indice }))
        .sort((a, b) => a.articulo.bodega.localeCompare(b.articulo.bodega, 'es', {
          numeric: true,
          sensitivity: 'base',
        }) || a.indice - b.indice)
        .map(({ articulo }) => articulo),
    }));
  }

  private resumirPersonas(valores: readonly (string | null | undefined)[], respaldo: string): string {
    const nombres = [...new Set(valores.map((valor) => valor?.trim()).filter((valor): valor is string => Boolean(valor)))];
    return nombres.join(', ') || respaldo;
  }
}
