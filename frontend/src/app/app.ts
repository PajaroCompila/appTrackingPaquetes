import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CrearUsuario } from './componentes/crear-usuario/crear-usuario';
import { InicioSesion } from './componentes/inicio-sesion/inicio-sesion';
import { Envios } from './componentes/envios/envios';
import { Despachos } from './componentes/despachos/despachos';
import { Recepciones } from './componentes/recepciones/recepciones';
import { Sucursales } from './componentes/sucursales/sucursales';
import { SeguimientoEnvios } from './componentes/seguimiento-envios/seguimiento-envios';
import { CodigoBarras } from './componentes/codigo-barras/codigo-barras';
import { DashboardAdministrativo } from './componentes/dashboard-administrativo/dashboard-administrativo';
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
    Despachos,
    Recepciones,
    SeguimientoEnvios,
    CodigoBarras,
    DashboardAdministrativo,
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
  protected readonly despachosVisible = signal(false);
  protected readonly recepcionesVisible = signal(false);
  protected readonly seguimientoVisible = signal(false);
  protected numeroGuia = '';
  protected readonly envioConsultado = signal<SeguimientoEnvio | null>(null);
  protected readonly buscandoGuia = signal(false);
  protected readonly mensajeConsulta = signal('');
  protected readonly mapaAmpliado = signal(false);
  protected readonly consultaPendiente = signal(false);

  private readonly servicioEnvios = inject(ServicioEnvios);

  constructor() {
    this.sesion.comprobar().subscribe();
  }

  @HostListener('document:keydown.escape', ['$event'])
  protected manejarEscape(evento: KeyboardEvent): void {
    if (this.mapaAmpliado()) {
      evento.preventDefault();
      this.cerrarMapa();
      return;
    }
    if (this.envioConsultado() || this.mensajeConsulta()) {
      evento.preventDefault();
      this.cerrarConsulta();
      return;
    }
    if (this.menuAbierto()) {
      this.cerrarMenu();
      return;
    }
    if (!this.sesion.usuario() && this.panelVisible()) {
      this.volverAlInicio();
      return;
    }
    if (this.seguimientoVisible() || this.enviosVisible() || this.despachosVisible() || this.recepcionesVisible() || this.sucursalesVisible() || this.crearUsuarioVisible()) {
      this.abrirInicio();
    }
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
    this.despachosVisible.set(false);
    this.sucursalesVisible.set(false);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }

  protected buscarEnvio(): void {
    this.numeroGuia = this.numeroGuia.trim();
    if (!this.numeroGuia || this.buscandoGuia()) return;
    if (!this.sesion.usuario()) {
      this.consultaPendiente.set(true);
      this.panelVisible.set(true);
      return;
    }
    this.ejecutarConsulta();
  }

  private ejecutarConsulta(): void {
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

  protected continuarConsulta(): void {
    this.panelVisible.set(false);
    if (!this.consultaPendiente()) return;
    this.consultaPendiente.set(false);
    this.ejecutarConsulta();
  }

  protected consultarDesdeSeguimiento(numeroGuia: string): void {
    this.numeroGuia = numeroGuia;
    this.ejecutarConsulta();
  }

  protected cerrarConsulta(): void {
    this.mapaAmpliado.set(false);
    this.envioConsultado.set(null);
    this.mensajeConsulta.set('');
  }

  protected ampliarMapa(): void {
    this.mapaAmpliado.set(true);
  }

  protected cerrarMapa(): void {
    this.mapaAmpliado.set(false);
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
    this.despachosVisible.set(false);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(true);
    this.cerrarMenu();
  }

  protected volverAlInicio(): void {
    this.consultaPendiente.set(false);
    this.menuAbierto.set(false);
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(false);
    this.enviosVisible.set(false);
    this.despachosVisible.set(false);
    this.seguimientoVisible.set(false);
    this.panelVisible.set(false);
  }

  protected abrirCrearUsuario(): void {
    if (this.puedeCrearUsuarios()) {
      this.crearUsuarioVisible.set(true);
      this.sucursalesVisible.set(false);
      this.enviosVisible.set(false);
      this.despachosVisible.set(false);
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
      this.despachosVisible.set(false);
      this.panelVisible.set(false);
      return;
    }
    this.sesion.cerrar().subscribe({
      next: () => {
        this.crearUsuarioVisible.set(false);
        this.sucursalesVisible.set(false);
        this.enviosVisible.set(false);
        this.despachosVisible.set(false);
        this.seguimientoVisible.set(false);
        this.panelVisible.set(false);
      },
    });
  }

  protected abrirSucursales(): void {
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(true);
    this.enviosVisible.set(false);
    this.despachosVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }

  protected abrirPaquetes(): void {
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(false);
    this.enviosVisible.set(true);
    this.despachosVisible.set(false);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }

  protected abrirDespachos(): void {
    this.crearUsuarioVisible.set(false);
    this.sucursalesVisible.set(false);
    this.enviosVisible.set(false);
    this.despachosVisible.set(true);
    this.recepcionesVisible.set(false);
    this.seguimientoVisible.set(false);
    this.cerrarMenu();
  }

  protected abrirRecepciones(): void { this.crearUsuarioVisible.set(false);this.sucursalesVisible.set(false);this.enviosVisible.set(false);this.despachosVisible.set(false);this.seguimientoVisible.set(false);this.recepcionesVisible.set(true);this.cerrarMenu(); }
}
