import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type SeccionPrueba = 'pendientes' | 'despachados' | 'historial';
type PestanaPrueba = 'pedidos' | 'articulos';

@Component({
  selector: 'app-microinteracciones-prueba',
  imports: [RouterLink],
  templateUrl: './microinteracciones-prueba.component.html',
  styleUrl: './microinteracciones-prueba.component.css',
})
export class MicrointeraccionesPruebaComponent {
  public readonly seccionActiva = signal<SeccionPrueba>('pendientes');
  public readonly pestanaActiva = signal<PestanaPrueba>('pedidos');
  public readonly modalAbierto = signal(false);
  public readonly actualizando = signal(false);
  public readonly sucursalSeleccionada = signal('Ninguna');

  public seleccionarSeccion(seccion: SeccionPrueba): void {
    this.seccionActiva.set(seccion);
  }

  public seleccionarPestana(pestana: PestanaPrueba): void {
    this.pestanaActiva.set(pestana);
  }

  public alternarActualizacion(): void {
    this.actualizando.update((valor) => !valor);
  }
}
