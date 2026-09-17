import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-confirmacion-impresion',
  templateUrl: './confirmacion-impresion.component.html',
  styleUrl: './confirmacion-impresion.component.css',
})
export class ConfirmacionImpresionComponent implements AfterViewInit, OnChanges {
  @Input() public abierta = false;
  @Input() public guardando = false;
  @Input() public error = '';
  @Output() public readonly confirmar = new EventEmitter<void>();
  @Output() public readonly descartar = new EventEmitter<void>();
  @ViewChild('dialogo', { static: true }) private dialogo?: ElementRef<HTMLDialogElement>;

  public ngAfterViewInit(): void { this.sincronizar(); }
  public ngOnChanges(): void { this.sincronizar(); }

  public cancelar(evento: Event): void {
    evento.preventDefault();
    if (!this.guardando) this.descartar.emit();
  }

  private sincronizar(): void {
    const dialogo = this.dialogo?.nativeElement;
    if (!dialogo) return;
    if (this.abierta && !dialogo.open) dialogo.showModal();
    if (!this.abierta && dialogo.open) dialogo.close();
  }
}
