import { HttpErrorResponse } from '@angular/common/http';
import { Component, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ServicioSesion } from '../../servicios/sesion.service';

@Component({
  selector: 'app-inicio-sesion',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule],
  templateUrl: './inicio-sesion.html',
  styleUrl: './inicio-sesion.css',
})
export class InicioSesion {
  readonly volver = output<void>();
  readonly ingresoCorrecto = output<void>();
  enviando = false;
  cerrando = false;
  mensajeError = '';
  readonly formulario = new FormGroup({
    nombreUsuario: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    contrasena: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
  });
  constructor(private readonly sesion: ServicioSesion) {}

  cerrar(): void {
    if (this.cerrando || this.enviando) {
      return;
    }
    this.cerrando = true;
    window.setTimeout(() => this.volver.emit(), 180);
  }

  ingresar(): void {
    if (this.formulario.invalid || this.enviando) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.enviando = true;
    this.mensajeError = '';
    const { nombreUsuario, contrasena } = this.formulario.getRawValue();
    this.sesion.iniciar(nombreUsuario, contrasena).subscribe({
      next: () => {
        this.enviando = false;
        this.ingresoCorrecto.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.enviando = false;
        this.mensajeError =
          typeof error.error?.mensaje === 'string'
            ? error.error.mensaje
            : 'No fue posible iniciar sesión';
      },
    });
  }
}
