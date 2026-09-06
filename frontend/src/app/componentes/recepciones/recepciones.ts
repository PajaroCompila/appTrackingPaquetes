import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Envio } from '../../modelos/envio';
import {
  Recepcion,
  ServicioRecepciones,
} from '../../servicios/recepciones.service';
import { ServicioSesion } from '../../servicios/sesion.service';

@Component({
  selector: 'app-recepciones',
  imports: [FormsModule],
  templateUrl: './recepciones.html',
  styleUrl: './recepciones.css',
})
export class Recepciones {
  readonly envios = signal<Envio[]>([]);
  readonly recepciones = signal<Recepcion[]>([]);
  readonly mensaje = signal('');
  readonly guiaActiva = signal(false);
  readonly enviosPorRecibir = signal<Envio[]>([]);
  readonly enviando = signal(false);
  guiaEscrita = '';
  readonly nombreUsuarioActual = computed(() => this.sesion.usuario()?.nombreCompleto ?? this.sesion.usuario()?.nombreUsuario ?? '');

  enviosFiltrados(): Envio[] {
    const texto = this.guiaEscrita.trim().toLowerCase();
    return this.envios()
      .filter((e) => !texto || e.numeroGuia.toLowerCase().includes(texto))
      .slice(0, 8);
  }
  constructor(
    private readonly servicio: ServicioRecepciones,
    private readonly sesion: ServicioSesion,
  ) {
    this.cargarEnvios();
    this.cargar();
  }

  cargarEnvios(): void {
    this.servicio.enviosDisponibles().subscribe((lista) => this.envios.set(lista));
  }

  cargar(): void {
    this.servicio.listar().subscribe((lista) => this.recepciones.set(lista));
  }
  escribirGuia(): void {
    this.guiaActiva.set(true);
  }
  seleccionarEnvio(envio: Envio): void {
    this.guiaEscrita = envio.numeroGuia;
    this.guiaActiva.set(false);
    this.agregarGuia();
  }

  agregarGuia(): void {
    const guia = this.guiaEscrita.trim().toLowerCase();
    const envio = this.envios().find((e) => e.numeroGuia.toLowerCase() === guia);
    if (!envio) {
      this.mensaje.set('Escribe o escanea una guía válida.');
      return;
    }
    if (this.enviosPorRecibir().some((e) => e.envioId === envio.envioId)) {
      this.mensaje.set('La guía ya está agregada.');
      this.guiaEscrita = '';
      return;
    }
    this.enviosPorRecibir.update((lista) => [...lista, envio]);
    this.guiaEscrita = '';
    this.mensaje.set('');
  }
  quitarEnvio(envioId: number): void {
    this.enviosPorRecibir.update((lista) => lista.filter((e) => e.envioId !== envioId));
  }

  guardar(): void {
    if (!this.enviosPorRecibir().length) {
      this.mensaje.set('Agrega al menos una guía.');
      return;
    }
    this.enviando.set(true);
    this.servicio
      .crearLote({
        envioIds: this.enviosPorRecibir().map((e) => e.envioId),
      })
      .subscribe({
        next: (resultados) => {
          this.recepciones.update((lista) => [...resultados, ...lista]);
          this.enviosPorRecibir.set([]);
          this.enviando.set(false);
          this.cargarEnvios();
          this.mensaje.set(
            `${resultados.length} ${resultados.length === 1 ? 'recepción registrada' : 'recepciones registradas'}.`,
          );
        },
        error: () => {
          this.enviando.set(false);
          this.mensaje.set('No fue posible registrar las recepciones.');
        },
      });
  }
}
