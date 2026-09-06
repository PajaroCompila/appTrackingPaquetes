import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Envio, EstadoEnvio } from '../../modelos/envio';
import type { Rol } from '../../modelos/sesion';
import { ServicioEnvios } from '../../servicios/envios.service';

@Component({
  selector: 'app-seguimiento-envios',
  imports: [DatePipe, FormsModule],
  templateUrl: './seguimiento-envios.html',
  styleUrl: './seguimiento-envios.css',
})
export class SeguimientoEnvios {
  readonly rolUsuario = input.required<Rol>();
  readonly envios = signal<Envio[]>([]);
  readonly cargando = signal(true);
  readonly mensaje = signal('');
  protected usuario = '';
  protected sucursal = '';
  protected guia = '';
  protected fecha = '';
  protected estado = '';

  readonly esAdministrador = computed(() => this.rolUsuario() === 'administrador');
  protected enviosFiltrados(): Envio[] {
    const usuario = this.usuario.trim().toLocaleLowerCase('es-HN');
    const sucursal = this.sucursal.trim().toLocaleLowerCase('es-HN');
    const guia = this.guia.trim().toLocaleLowerCase('es-HN');
    return this.envios().filter((envio) =>
      (!usuario || envio.nombreUsuario.toLocaleLowerCase('es-HN').includes(usuario)) &&
      (!sucursal || `${envio.puntoOrigen} ${envio.puntoDestino}`.toLocaleLowerCase('es-HN').includes(sucursal)) &&
      (!guia || envio.numeroGuia.toLocaleLowerCase('es-HN').includes(guia)) &&
      (!this.fecha || envio.fechaCreacion.slice(0, 10) === this.fecha) &&
      (!this.estado || envio.estadoActual === this.estado),
    );
  }

  constructor(private readonly servicio: ServicioEnvios) {
    this.servicio.listar().subscribe({
      next: (envios) => { this.envios.set(envios); this.cargando.set(false); },
      error: () => { this.mensaje.set('No fue posible cargar los envíos.'); this.cargando.set(false); },
    });
  }

  protected limpiarFiltros(): void {
    this.usuario = ''; this.sucursal = ''; this.guia = ''; this.fecha = ''; this.estado = '';
  }

  protected nombreEstado(estado: EstadoEnvio): string {
    return ({ registrado: 'Registrado', en_transito: 'En tránsito', recibido: 'Recibido', cancelado: 'Cancelado' })[estado];
  }
}
