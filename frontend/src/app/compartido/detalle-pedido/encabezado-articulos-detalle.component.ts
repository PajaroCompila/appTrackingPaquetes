import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-encabezado-articulos-detalle',
  templateUrl: './encabezado-articulos-detalle.component.html',
  styleUrl: './encabezado-articulos-detalle.component.css',
})
export class EncabezadoArticulosDetalleComponent {
  @Input() public titulo = '';
  @Input() public cantidad = 0;
  @Input() public cantidadImpresion = 0;
  @Input() public cantidadTransferencia = 0;
  @Input() public bloqueado = false;
  @Input() public permitirImpresion = true;
  @Input() public permitirTransferencia = false;
  @Output() public readonly transferir = new EventEmitter<void>();
  @Output() public readonly imprimir = new EventEmitter<void>();
}
