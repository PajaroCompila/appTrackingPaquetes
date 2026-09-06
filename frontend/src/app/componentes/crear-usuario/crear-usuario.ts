import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { merge } from 'rxjs';
import type { Rol } from '../../modelos/sesion';
import { ServicioUsuarios, type UsuarioListado } from '../../servicios/usuarios.service';
import { ServicioSucursales } from '../../servicios/sucursales.service';
import type { Sucursal } from '../../modelos/sucursal';

@Component({
  selector: 'app-crear-usuario',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './crear-usuario.html',
  styleUrl: './crear-usuario.css',
})
export class CrearUsuario {
  readonly rolCreador = input.required<Rol>();
  readonly cerrarVista = output<void>();
  readonly rolesDisponibles = computed<Rol[]>(() =>
    this.rolCreador() === 'administrador'
      ? ['usuario', 'supervisor', 'administrador']
      : ['usuario'],
  );
  enviando = false;
  mensajeError = '';
  contrasenaTemporal = '';
  readonly mensajeExito = signal('');
  readonly editando = signal<UsuarioListado | null>(null);
  readonly listaVisible = signal(false);
  readonly cargandoUsuarios = signal(false);
  readonly usuariosRegistrados = signal<UsuarioListado[]>([]);
  readonly mensajeLista = signal('');
  readonly sucursales = signal<Sucursal[]>([]);
  readonly formulario = new FormGroup({
    sucursalId: new FormControl<number | null>(null, [Validators.required]),
    nombres: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    apellidos: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    nombreUsuario: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(40),
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
      ],
    }),
    correoElectronico: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(160)],
    }),
    rol: new FormControl<Rol>('usuario', { nonNullable: true, validators: [Validators.required] }),
    activo: new FormControl(true, { nonNullable: true }),
    restablecerContrasena: new FormControl(false, { nonNullable: true }),
  });
  constructor(private readonly usuarios: ServicioUsuarios, sucursales: ServicioSucursales) {
    sucursales.listar().subscribe(lista => this.sucursales.set(lista.filter(s => s.activo)));
    merge(
      this.formulario.controls.nombres.valueChanges,
      this.formulario.controls.apellidos.valueChanges,
    ).subscribe(() => this.completarNombreUsuario());
  }

  private completarNombreUsuario(): void {
    const primerNombre = this.formulario.controls.nombres.value.trim().split(/\s+/)[0] ?? '';
    const primerApellido = this.formulario.controls.apellidos.value.trim().split(/\s+/)[0] ?? '';
    const nombreUsuario = this.limpiarTexto(`${primerNombre.charAt(0)}${primerApellido}`);

    this.formulario.controls.nombreUsuario.setValue(nombreUsuario, { emitEvent: false });
  }

  private limpiarTexto(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  cambiarVista(): void {
    if (this.listaVisible()) {
      this.cancelarEdicion();
      this.listaVisible.set(false);
      return;
    }
    this.listaVisible.set(true);
    this.cargarUsuarios();
  }

  verUsuariosDespuesCrear(): void {
    this.contrasenaTemporal = '';
    this.mensajeExito.set('');
    this.editando.set(null);
    this.listaVisible.set(true);
    this.cargarUsuarios();
  }

  editar(usuario: UsuarioListado): void {
    this.editando.set(usuario);
    this.listaVisible.set(false);
    this.mensajeError = '';
    this.formulario.reset({
      sucursalId: usuario.sucursalId,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      nombreUsuario: usuario.nombreUsuario,
      correoElectronico: usuario.correoElectronico,
      rol: usuario.rol,
      activo: usuario.activo,
      restablecerContrasena: false,
    });
  }

  cancelarEdicion(): void {
    this.editando.set(null);
    this.mensajeError = '';
    this.formulario.reset({ rol: 'usuario', activo: true, restablecerContrasena: false });
  }

  cancelarFormulario(): void {
    if (this.editando()) {
      this.cancelarEdicion();
      this.listaVisible.set(true);
      this.cargarUsuarios();
      return;
    }
    this.cerrar();
  }

  private cargarUsuarios(): void {
    this.cargandoUsuarios.set(true);
    this.mensajeLista.set('');
    this.usuarios.listar().subscribe({
      next: (usuarios) => {
        this.usuariosRegistrados.set(usuarios);
        this.cargandoUsuarios.set(false);
      },
      error: () => {
        this.cargandoUsuarios.set(false);
        this.mensajeLista.set('No fue posible cargar los usuarios.');
      },
    });
  }

  crear(): void {
    if (this.formulario.invalid || this.enviando) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.enviando = true;
    this.mensajeError = '';
    const valores = this.formulario.getRawValue();
    const operacion = this.editando()
      ? this.usuarios.actualizar(this.editando()!.usuarioId, valores)
      : this.usuarios.crear(valores);
    operacion.subscribe({
      next: (resultado) => {
        this.enviando = false;
        this.contrasenaTemporal = resultado.contrasenaTemporal ?? '';
        this.mensajeExito.set(
          this.editando() ? 'Usuario actualizado exitosamente' : 'Usuario creado exitosamente',
        );
        this.editando.set(null);
        this.formulario.reset({ rol: 'usuario', activo: true, restablecerContrasena: false });
      },
      error: (error: HttpErrorResponse) => {
        this.enviando = false;
        this.mensajeError =
          typeof error.error?.mensaje === 'string'
            ? error.error.mensaje
            : 'No fue posible crear el usuario';
      },
    });
  }
  copiarContrasena(): void {
    void navigator.clipboard.writeText(this.contrasenaTemporal);
  }
  cerrar(): void {
    this.contrasenaTemporal = '';
    this.mensajeExito.set('');
    this.cerrarVista.emit();
  }
}
