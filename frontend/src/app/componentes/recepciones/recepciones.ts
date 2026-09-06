import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Envio } from '../../modelos/envio';
import { ServicioEnvios } from '../../servicios/envios.service';
import {
  Recepcion,
  ServicioRecepciones,
  UsuarioReceptor,
} from '../../servicios/recepciones.service';

@Component({
  selector: 'app-recepciones',
  imports: [FormsModule],
  templateUrl: './recepciones.html',
  styleUrl: './recepciones.css',
})
export class Recepciones {
  readonly envios = signal<Envio[]>([]);
  readonly usuarios = signal<UsuarioReceptor[]>([]);
  readonly recepciones = signal<Recepcion[]>([]);
  readonly mensaje = signal('');
  readonly guiaActiva = signal(false);
  readonly usuarioActivo = signal(false);
  readonly enviosPorRecibir = signal<Envio[]>([]);
  readonly enviando = signal(false);
  guiaEscrita = '';
  usuarioEscrito = '';

  enviosFiltrados(): Envio[] {
    const texto = this.guiaEscrita.trim().toLowerCase();
    return this.envios()
      .filter((e) => !texto || e.numeroGuia.toLowerCase().includes(texto))
      .slice(0, 8);
  }
  usuariosFiltrados(): UsuarioReceptor[] {
    const texto = this.usuarioEscrito.trim().toLowerCase();
    return this.usuarios()
      .filter((u) => !texto || u.nombreUsuario.toLowerCase().includes(texto))
      .slice(0, 8);
  }

  constructor(
    private readonly servicio: ServicioRecepciones,
    envios: ServicioEnvios,
  ) {
    envios
      .listar()
      .subscribe((lista) => this.envios.set(lista.filter((e) => e.estadoActual !== 'recibido')));
    servicio.usuarios().subscribe((lista) => this.usuarios.set(lista));
    this.cargar();
  }

  cargar(): void {
    this.servicio.listar().subscribe((lista) => this.recepciones.set(lista));
  }
  escribirGuia(): void {
    this.guiaActiva.set(true);
  }
  escribirUsuario(): void {
    this.usuarioActivo.set(true);
  }
  seleccionarEnvio(envio: Envio): void {
    this.guiaEscrita = envio.numeroGuia;
    this.guiaActiva.set(false);
    this.agregarGuia();
  }
  seleccionarUsuario(usuario: UsuarioReceptor): void {
    this.usuarioEscrito = usuario.nombreUsuario;
    this.usuarioActivo.set(false);
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
    const nombreUsuario = this.usuarioEscrito.trim().toLowerCase();
    const usuario = this.usuarios().find((u) => u.nombreUsuario.toLowerCase() === nombreUsuario);
    if (!this.enviosPorRecibir().length) {
      this.mensaje.set('Agrega al menos una guía.');
      return;
    }
    if (!usuario) {
      this.mensaje.set('Escribe un usuario registrado.');
      return;
    }
    this.enviando.set(true);
    this.servicio
      .crearLote({
        envioIds: this.enviosPorRecibir().map((e) => e.envioId),
        usuarioRecibeId: usuario.usuarioId,
      })
      .subscribe({
        next: (resultados) => {
          const ids = new Set(resultados.map((r) => r.envioId));
          this.recepciones.update((lista) => [...resultados, ...lista]);
          this.envios.update((lista) => lista.filter((e) => !ids.has(e.envioId)));
          this.enviosPorRecibir.set([]);
          this.usuarioEscrito = '';
          this.enviando.set(false);
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
