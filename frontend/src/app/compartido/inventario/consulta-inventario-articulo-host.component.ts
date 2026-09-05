import { Component, inject } from '@angular/core';
import { DialogoInventarioArticuloComponent } from '../../funcionalidades/pedidos/dialogo-inventario-articulo.component';
import { ConsultaInventarioArticuloService } from './consulta-inventario-articulo.service';

@Component({
  selector: 'app-consulta-inventario-articulo-host',
  imports: [DialogoInventarioArticuloComponent],
  template: `
    @if (consulta.abierto()) {
      <app-dialogo-inventario-articulo
        [estado]="consulta.estado()"
        [inventario]="consulta.inventario()"
        (cerrar)="consulta.cerrar()"
      />
    }
  `,
})
export class ConsultaInventarioArticuloHostComponent {
  public readonly consulta = inject(ConsultaInventarioArticuloService);
}
