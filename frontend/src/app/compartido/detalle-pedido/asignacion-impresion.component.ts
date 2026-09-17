import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
import type { TecnicoAsignable } from '../asignaciones/asignacion.interface';
import type { ArticuloDetalleVisual } from './detalle-pedido-vista.interface';

@Component({
  selector: 'app-asignacion-impresion',
  templateUrl: './asignacion-impresion.component.html',
  styleUrl: './asignacion-impresion.component.css',
})
export class AsignacionImpresionComponent implements AfterViewInit, OnChanges {
  @Input() public abierta = false;
  @Input() public guardando = false;
  @Input() public articulos: readonly ArticuloDetalleVisual[] = [];
  @Input() public usuarios: readonly TecnicoAsignable[] = [];
  @Input() public error = '';
  @Output() public readonly confirmar = new EventEmitter<string>();
  @Output() public readonly cancelar = new EventEmitter<void>();
  @ViewChild('dialogo', { static: true }) private dialogo?: ElementRef<HTMLDialogElement>;
  public seleccionado = '';

  public ngAfterViewInit(): void { this.sincronizar(); }
  public ngOnChanges(): void { this.sincronizar(); }

  public cerrar(evento: Event): void {
    evento.preventDefault();
    if (!this.guardando) this.cancelar.emit();
  }

  private sincronizar(): void {
    const dialogo = this.dialogo?.nativeElement;
    if (!dialogo) return;
    if (this.abierta && !dialogo.open) {
      this.seleccionado = this.usuarios.length === 1 ? this.usuarios[0]!.usuario : '';
      dialogo.showModal();
    }
    if (!this.abierta && dialogo.open) dialogo.close();
  }
}
