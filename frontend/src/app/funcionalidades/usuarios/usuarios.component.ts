import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CodigoRol, RolLocal, UsuarioLocal } from './usuario.interface';
import { UsuarioService } from './usuario.service';
import { formatearFechaHoraHonduras } from '../../compartido/fechas/fecha-honduras';

const claveFiltrosUsuarios = 'pedidosBodega.usuarios.filtros';

@Component({
  selector: 'app-usuarios',
  imports: [FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css',
})
export class UsuariosComponent implements OnInit {
  public fecha(valor: string | null | undefined): string {
    return formatearFechaHoraHonduras(valor);
  }
  private readonly servicio = inject(UsuarioService);
  public readonly usuarios = signal<UsuarioLocal[]>([]);
  public readonly roles = signal<RolLocal[]>([]);
  public readonly cargando = signal(false);
  public readonly error = signal('');
  public readonly modal = signal<'crear' | 'editar' | 'restablecer' | null>(null);
  public readonly seleccionado = signal<UsuarioLocal | null>(null);
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public busqueda = '';
  public rol = '';
  public activo = '';
  public form = { nombreCompleto: '', nombreUsuario: '', correo: '', codigoRol: 'CONSULTA' as CodigoRol,
    contrasena: '', confirmarContrasena: '', activo: true };

  public ngOnInit(): void {
    this.restaurarFiltros();
    this.servicio.roles().subscribe(({ datos }) => this.roles.set(datos));
    this.cargar();
  }
  public cargar(): void {
    this.cargando.set(true);
    this.servicio.listar({ busqueda: this.busqueda, rol: this.rol, activo: this.activo,
      pagina: this.pagina(), cantidadPorPagina: 25 }).subscribe({
      next: (respuesta) => {
        this.usuarios.set(respuesta.datos); this.hayMas.set(respuesta.paginacion.hayMas);
        this.cargando.set(false);
      },
      error: () => { this.error.set('No pudimos cargar los usuarios.'); this.cargando.set(false); },
    });
  }
  public buscar(): void { this.pagina.set(1); this.guardarFiltros(); this.cargar(); }
  public crear(): void {
    this.seleccionado.set(null);
    this.form = { nombreCompleto: '', nombreUsuario: '', correo: '', codigoRol: 'CONSULTA',
      contrasena: '', confirmarContrasena: '', activo: true };
    this.modal.set('crear');
  }
  public editar(usuario: UsuarioLocal): void {
    this.seleccionado.set(usuario);
    this.form = { nombreCompleto: usuario.nombreCompleto, nombreUsuario: usuario.nombreUsuario,
      correo: usuario.correo ?? '', codigoRol: usuario.codigoRol, contrasena: '',
      confirmarContrasena: '', activo: usuario.activo };
    this.modal.set('editar');
  }
  public restablecer(usuario: UsuarioLocal): void {
    this.seleccionado.set(usuario); this.form.contrasena = ''; this.form.confirmarContrasena = '';
    this.modal.set('restablecer');
  }
  public cerrar(): void { this.modal.set(null); this.error.set(''); }
  public guardar(): void {
    const operacion = this.modal() === 'crear' ? this.servicio.crear(this.form)
      : this.servicio.editar(this.seleccionado()!.usuarioId, this.form);
    operacion.subscribe({ next: () => { this.cerrar(); this.cargar(); },
      error: () => this.error.set('Revisá los datos. Ese usuario puede que ya exista.') });
  }
  public guardarContrasena(): void {
    this.servicio.restablecer(this.seleccionado()!.usuarioId, this.form.contrasena,
      this.form.confirmarContrasena).subscribe({ next: () => this.cerrar(),
      error: () => this.error.set('Las contraseñas no coinciden o no son válidas.') });
  }
  public cambiarEstado(usuario: UsuarioLocal): void {
    const accion = usuario.activo ? 'desactivar' : 'activar';
    if (!confirm(`¿Deseás ${accion} a ${usuario.nombreUsuario}?`)) return;
    this.servicio.estado(usuario.usuarioId, !usuario.activo).subscribe({ next: () => this.cargar(),
      error: () => this.error.set('No pudimos cambiar el estado del usuario.') });
  }
  public anterior(): void {
    if (this.pagina() > 1) { this.pagina.update((valor) => valor - 1); this.guardarFiltros(); this.cargar(); }
  }
  public siguiente(): void {
    if (this.hayMas()) { this.pagina.update((valor) => valor + 1); this.guardarFiltros(); this.cargar(); }
  }

  private guardarFiltros(): void {
    try { localStorage.setItem(claveFiltrosUsuarios, JSON.stringify({ busqueda: this.busqueda,
      rol: this.rol, activo: this.activo, pagina: this.pagina() })); }
    catch { /* La pantalla conserva los filtros mientras permanece abierta. */ }
  }
  private restaurarFiltros(): void {
    try {
      const filtros = JSON.parse(localStorage.getItem(claveFiltrosUsuarios) ?? '{}') as Record<string, unknown>;
      this.busqueda = typeof filtros['busqueda'] === 'string' ? filtros['busqueda'].slice(0, 100) : '';
      this.rol = typeof filtros['rol'] === 'string' ? filtros['rol'].slice(0, 30) : '';
      this.activo = filtros['activo'] === 'true' || filtros['activo'] === 'false' ? filtros['activo'] : '';
      const pagina = Number(filtros['pagina']);
      this.pagina.set(Number.isInteger(pagina) && pagina > 0 ? pagina : 1);
    } catch { /* Se utilizan los filtros iniciales. */ }
  }
}
