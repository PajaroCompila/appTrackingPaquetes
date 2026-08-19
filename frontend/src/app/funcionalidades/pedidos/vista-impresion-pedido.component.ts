import { Component, Input } from '@angular/core';

export interface ArticuloImpresionPedido {
  codigo: string;
  descripcion: string;
  cantidad: number | null;
  bodega: string;
}

@Component({
  selector: 'app-vista-impresion-pedido',
  templateUrl: './vista-impresion-pedido.component.html',
  styleUrl: './vista-impresion-pedido.component.css',
})
export class VistaImpresionPedidoComponent {
  @Input({ required: true }) public articulos: readonly ArticuloImpresionPedido[] = [];
  @Input() public fechaHora = '';
}
