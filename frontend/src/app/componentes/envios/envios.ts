import { CommonModule } from '@angular/common';
import { Component, effect, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import type { ActualizacionEnvio, DatosEnvio, Envio, EstadoEnvio } from '../../modelos/envio';
import type { Sucursal } from '../../modelos/sucursal';
import { ServicioEnvios } from '../../servicios/envios.service';
import { ServicioSucursales } from '../../servicios/sucursales.service';
import { CodigoBarras } from '../codigo-barras/codigo-barras';
import type { Rol } from '../../modelos/sesion';

@Component({
  selector: 'app-envios',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, CodigoBarras],
  templateUrl: './envios.html',
  styleUrl: './envios.css',
})
export class Envios {
  readonly puedeCrear = input(false);
  readonly rolUsuario = input.required<Rol>();
  readonly sucursalIdUsuario = input.required<number>();
  readonly envios = signal<Envio[]>([]);
  readonly sucursales = signal<Sucursal[]>([]);
  readonly cargando = signal(true);
  readonly mensaje = signal('');
  readonly envioEnEdicion = signal<Envio | null>(null);
  readonly formulario = new FormGroup({
    puntoOrigenId: new FormControl<number | null>(null, [Validators.required]),
    puntoDestinoId: new FormControl<number | null>(null, [Validators.required]),
    nombreRemitente: new FormControl('', [Validators.required, Validators.maxLength(120)]),
    telefonoRemitente: new FormControl('', [Validators.required, Validators.maxLength(30)]),
    nombreDestinatario: new FormControl('', [Validators.required, Validators.maxLength(120)]),
    telefonoDestinatario: new FormControl('', [Validators.required, Validators.maxLength(30)]),
    descripcion: new FormControl('', [Validators.required, Validators.maxLength(250)]),
    cantidadPaquetes: new FormControl(1, [Validators.required, Validators.min(1), Validators.max(1000)]),
    estadoActual: new FormControl<EstadoEnvio>('registrado', { nonNullable: true }),
  });

  constructor(private readonly servicio: ServicioEnvios, servicioSucursales: ServicioSucursales) {
    servicioSucursales.listar().subscribe({ next: (resultado) => this.sucursales.set(resultado) });
    this.cargar();
    effect(() => {
      if (this.rolUsuario() === 'administrador') {
        this.formulario.controls.puntoOrigenId.enable({ emitEvent: false });
      } else {
        this.formulario.controls.puntoOrigenId.setValue(this.sucursalIdUsuario(), { emitEvent: false });
        this.formulario.controls.puntoOrigenId.disable({ emitEvent: false });
      }
    });
  }

  cargar(): void {
    this.servicio.listar().subscribe({
      next: (resultado) => { this.envios.set(resultado); this.cargando.set(false); },
      error: () => { this.mensaje.set('No fue posible cargar los envíos'); this.cargando.set(false); },
    });
  }

  guardar(): void {
    if (!this.puedeCrear() || this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.mensaje.set('');
    const datos = this.formulario.getRawValue();
    const envioActual = this.envioEnEdicion();
    const operacion = envioActual
      ? this.servicio.actualizar(envioActual.envioId, datos as ActualizacionEnvio)
      : this.servicio.crear(datos as DatosEnvio);
    operacion.subscribe({
      next: (envio) => {
        this.envios.update((envios) => envioActual
          ? envios.map((registro) => registro.envioId === envio.envioId ? envio : registro)
          : [envio, ...envios]);
        this.cancelarEdicion();
        this.mensaje.set(envioActual ? 'Envío actualizado' : 'Envío registrado');
      },
      error: () => this.mensaje.set('No fue posible guardar el envío'),
    });
  }

  editar(envio: Envio): void {
    this.envioEnEdicion.set(envio);
    this.mensaje.set('');
    this.formulario.setValue({
      puntoOrigenId: envio.puntoOrigenId,
      puntoDestinoId: envio.puntoDestinoId,
      nombreRemitente: envio.nombreRemitente,
      telefonoRemitente: envio.telefonoRemitente,
      nombreDestinatario: envio.nombreDestinatario,
      telefonoDestinatario: envio.telefonoDestinatario,
      descripcion: envio.descripcion,
      cantidadPaquetes: envio.cantidadPaquetes,
      estadoActual: envio.estadoActual,
    });
    document.querySelector('.envio-formulario')?.scrollIntoView({ behavior: 'smooth' });
  }

  cancelarEdicion(): void {
    this.envioEnEdicion.set(null);
    this.formulario.reset({ cantidadPaquetes: 1, estadoActual: 'registrado' });
    if (this.rolUsuario() !== 'administrador') this.formulario.controls.puntoOrigenId.setValue(this.sucursalIdUsuario());
  }

  eliminar(envio: Envio): void {
    if (!window.confirm(`¿Eliminar el envío ${envio.numeroGuia}?`)) return;
    this.servicio.eliminar(envio.envioId).subscribe({
      next: () => {
        this.envios.update((envios) => envios.filter((registro) => registro.envioId !== envio.envioId));
        if (this.envioEnEdicion()?.envioId === envio.envioId) this.cancelarEdicion();
        this.mensaje.set('Envío eliminado');
      },
      error: () => this.mensaje.set('No fue posible eliminar el envío'),
    });
  }
}
