import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CrearUsuario } from './componentes/crear-usuario/crear-usuario';
import { InicioSesion } from './componentes/inicio-sesion/inicio-sesion';
import { Envios } from './componentes/envios/envios';
import { Recepciones } from './componentes/recepciones/recepciones';
import { Sucursales } from './componentes/sucursales/sucursales';
import { SeguimientoEnvios } from './componentes/seguimiento-envios/seguimiento-envios';
import { ServicioSesion } from './servicios/sesion.service';
import { ServicioEnvios } from './servicios/envios.service';
import type { SeguimientoEnvio } from './modelos/envio';

@Component({
  selector: 'app-root',
  imports: [
    ButtonModule,
    FormsModule,
    InputTextModule,
    InicioSesion,
    CrearUsuario,
    Sucursales,
    Envios,
    Recepciones,
    SeguimientoEnvios,
    DatePipe,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css', './inicio-panel.css'],
})
export class Aplicacion {
  protected readonly modoPresentacion = false;
  protected readonly sesion = inject(ServicioSesion);
  protected readonly panelVisible = signal(false);
  protected readonly menuAbierto = signal(false);
  protected readonly crearUsuarioVisible = signal(false);
  protected readonly puedeCrearUsuarios = computed(() =>
    ['supervisor', 'administrador'].includes(this.sesion.usuario()?.rol ?? ''),
  );
  protected readonly nombreUsuarioActual = computed(
    () => this.sesion.usuario()?.nombreUsuario ?? '',
  );
  protected readonly rolUsuarioActual = computed(() => {
    const rol = this.sesion.usuario()?.rol;
    if (rol === 'administrador') return 'Administrador';
    if (rol === 'supervisor') return 'Supervisor';
    return 'Usuario';
  });
  protected readonly sucursalesVisible = signal(false);
  protected readonly enviosVisible = signal(false);
  protected readonly recepcionesVisible = signal(false);
  protected readonly seguimientoVisible = signal(false);
  protected numeroGuia = '';
  protected readonly envioConsultado = signal<SeguimientoEnvio | null>(null);
  protected readonly buscandoGuia = signal(false);
  protected readonly mensajeConsulta = signal('');

  private readonly servicioEnvios = inject(ServicioEnvios);

  constructor() {
    this.sesion.comprobar().subscribe();
  }

  protected alternarMenu(): void {
    this.menuAbierto.update((estaAbierto) => !estaAbierto);
  }

  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  protected abrirInicio(): void {
    this.crearUsuarioVisible.set(false);
    this.enviosVisible.set(false);
    this.sucursalesVisible.set(false);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }

  protected buscarEnvio(): void {
    this.numeroGuia = this.numeroGuia.trim();
    if (!this.numeroGuia || this.buscandoGuia()) return;
    this.buscandoGuia.set(true);
    this.mensajeConsulta.set('');
    this.envioConsultado.set(null);
    this.servicioEnvios.consultar(this.numeroGuia).subscribe({
      next: (envio) => {
        this.envioConsultado.set(envio);
        this.buscandoGuia.set(false);
      },
      error: () => {
        this.mensajeConsulta.set('No encontramos un envío con ese número de guía.');
        this.buscandoGuia.set(false);
      },
    });
  }

  protected cerrarConsulta(): void {
    this.envioConsultado.set(null);
    this.mensajeConsulta.set('');
  }

  protected nombreEstado(estado: SeguimientoEnvio['estadoActual']): string {
    const estados = {
      registrado: 'Registrado',
      en_transito: 'En tránsito',
      recibido: 'Recibido',
      cancelado: 'Cancelado',
    };
    return estados[estado];
  }

  protected abrirPanel(): void {
    if (this.modoPresentacion) {
      this.sesion.usuario.set({ usuarioId: 0, nombreUsuario: 'sistemas', rol: 'administrador', sucursalId: 0 });
    }
    this.panelVisible.set(true);
  }

  protected abrirSeguimiento(): void {
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(false);
    this.enviosVisible.set(false);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(true);
    this.cerrarMenu();
  }

  protected volverAlInicio(): void {
    this.menuAbierto.set(false);
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(false);
    this.enviosVisible.set(false);
    this.seguimientoVisible.set(false);
    this.panelVisible.set(false);
  }

  protected abrirCrearUsuario(): void {
    if (this.puedeCrearUsuarios()) {
      this.crearUsuarioVisible.set(true);
      this.sucursalesVisible.set(false);
      this.enviosVisible.set(false);
      this.seguimientoVisible.set(false);
      this.cerrarMenu();
    }
  }

  protected cerrarSesion(): void {
    if (this.modoPresentacion) {
      this.sesion.usuario.set(null);
      this.crearUsuarioVisible.set(false);
      this.sucursalesVisible.set(false);
      this.enviosVisible.set(false);
      this.panelVisible.set(false);
      return;
    }
    this.sesion.cerrar().subscribe({
      next: () => {
        this.crearUsuarioVisible.set(false);
        this.sucursalesVisible.set(false);
        this.enviosVisible.set(false);
        this.seguimientoVisible.set(false);
        this.panelVisible.set(false);
      },
    });
  }

  protected abrirSucursales(): void {
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(true);
    this.enviosVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }

  protected abrirEnvios(): void {
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(false);
    this.enviosVisible.set(true);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }
  protected abrirRecepciones(): void { this.crearUsuarioVisible.set(false);this.sucursalesVisible.set(false);this.enviosVisible.set(false);this.seguimientoVisible.set(false);this.recepcionesVisible.set(true);this.cerrarMenu(); }
}
