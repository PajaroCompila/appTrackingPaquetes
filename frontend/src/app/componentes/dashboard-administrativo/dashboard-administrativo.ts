import { DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import type { Despacho } from '../../modelos/despacho';
import type { Envio } from '../../modelos/envio';
import type { Sucursal } from '../../modelos/sucursal';
import { ServicioDespachos } from '../../servicios/despachos.service';
import { ServicioEnvios } from '../../servicios/envios.service';
import { ServicioSucursales } from '../../servicios/sucursales.service';
import { ServicioUsuarios, type UsuarioListado } from '../../servicios/usuarios.service';

@Component({
  selector: 'app-dashboard-administrativo',
  imports: [DatePipe],
  templateUrl: './dashboard-administrativo.html',
  styleUrl: './dashboard-administrativo.css',
})
export class DashboardAdministrativo {
  readonly paquetes = signal<Envio[]>([]);
  readonly despachos = signal<Despacho[]>([]);
  readonly usuarios = signal<UsuarioListado[]>([]);
  readonly sucursales = signal<Sucursal[]>([]);
  readonly cargando = signal(true);
  readonly totalEnTransito = computed(() => this.paquetes().filter((paquete) => paquete.estadoActual === 'en_transito').length);
  readonly totalRecibidos = computed(() => this.paquetes().filter((paquete) => paquete.estadoActual === 'recibido').length);
  readonly despachosActivos = computed(() => this.despachos().filter((despacho) => despacho.estado === 'despachado').length);
  readonly usuariosActivos = computed(() => this.usuarios().filter((usuario) => usuario.activo).length);
  readonly ultimosPaquetes = computed(() => this.paquetes().slice(0, 5));
  readonly sucursalesActivas = computed(() => this.sucursales().filter((sucursal) => sucursal.activo).slice(0, 5));

  constructor(
    servicioEnvios: ServicioEnvios,
    servicioDespachos: ServicioDespachos,
    servicioUsuarios: ServicioUsuarios,
    servicioSucursales: ServicioSucursales,
  ) {
    forkJoin({
      paquetes: servicioEnvios.listar(),
      despachos: servicioDespachos.listar(),
      usuarios: servicioUsuarios.listar(),
      sucursales: servicioSucursales.listar(),
    }).subscribe({
      next: (datos) => {
        this.paquetes.set(datos.paquetes);
        this.despachos.set(datos.despachos);
        this.usuarios.set(datos.usuarios);
        this.sucursales.set(datos.sucursales);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  nombreEstado(estado: Envio['estadoActual']): string {
    return { registrado: 'Registrado', en_transito: 'En tránsito', recibido: 'Recibido', cancelado: 'Cancelado' }[estado];
  }
}
