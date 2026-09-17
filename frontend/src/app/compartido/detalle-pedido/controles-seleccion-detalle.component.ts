import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-selector-transferencia-detalle',
  template: `<label class="selector-linea selector-transferencia" title="Seleccionar para transferir">
    <input class="selector-transferencia-detalle" type="checkbox" [disabled]="bloqueado" [checked]="seleccionado"
      [attr.aria-label]="etiqueta" (click)="$event.stopPropagation()"
      (change)="seleccionar.emit($any($event.target).checked)" /><span aria-hidden="true">✓</span>
  </label>`,
  styles: `
    :host { display: inline-block; }
    .selector-linea { position: relative; display: inline-grid; width: 2.25rem; height: 2.25rem; place-items: center; cursor: pointer; }
    .selector-linea input { position: absolute; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    .selector-linea span { display: grid; width: 1.45rem; height: 1.45rem; place-items: center; border: 2px solid #8199b2; border-radius: 50%; background: white; color: transparent; font-size: .82rem; font-weight: 900; }
    .selector-transferencia input:checked + span { border-color: #287052; background: #287052; color: white; }
    .selector-linea input:focus-visible + span { outline: 3px solid #65a8df; outline-offset: 2px; }
    .selector-linea input:disabled { cursor: not-allowed; }
  `,
})
export class SelectorTransferenciaDetalleComponent {
  @Input() public seleccionado = false;
  @Input() public bloqueado = false;
  @Input() public etiqueta = '';
  @Output() public readonly seleccionar = new EventEmitter<boolean>();
}

@Component({
  selector: 'app-accion-seleccion-detalle',
  template: `<button class="accion-seleccion-todo" type="button" [disabled]="bloqueado"
    [attr.aria-pressed]="seleccionados" (click)="seleccionar.emit()">{{ etiqueta }}</button>`,
  styles: `
    .accion-seleccion-todo { position: relative; isolation: isolate; border: 0; padding: 0; background: transparent; color: var(--azul-900); font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
    .accion-seleccion-todo::before { content: ''; position: absolute; inset: -.25rem -.4rem; z-index: -1; border: 1px solid #bfd0e0; border-radius: .5rem; background: #eaf1f8; transition: background-color var(--transicion-normal) var(--easing-corporativo), box-shadow var(--transicion-normal) var(--easing-corporativo), transform var(--transicion-normal) var(--easing-corporativo); }
    .accion-seleccion-todo:hover:not(:disabled)::before { border-color: #8caac8; background: #dbe9f7; }
    .accion-seleccion-todo[aria-pressed="true"],
    .accion-seleccion-todo:active:not(:disabled) { color: white; }
    .accion-seleccion-todo[aria-pressed="true"]:not(:disabled)::before,
    .accion-seleccion-todo:active:not(:disabled)::before { border-color: transparent; background: var(--azul-700); }
    .accion-seleccion-todo:hover:not(:disabled)::before { box-shadow: var(--sombra-interaccion); transform: translateY(-1px); }
    .accion-seleccion-todo:active:not(:disabled)::before { box-shadow: none; transform: translateY(1px); }
    .accion-seleccion-todo:focus-visible { outline: none; }
    .accion-seleccion-todo:focus-visible::before { outline: 3px solid #65a8df; outline-offset: 2px; }
    .accion-seleccion-todo:disabled { cursor: not-allowed; opacity: .5; }
    @media (prefers-reduced-motion: reduce) { .accion-seleccion-todo::before { transition: none; transform: none !important; } }
  `,
})
export class AccionSeleccionDetalleComponent {
  @Input() public etiqueta = '';
  @Input() public seleccionados = false;
  @Input() public bloqueado = false;
  @Output() public readonly seleccionar = new EventEmitter<void>();
}
