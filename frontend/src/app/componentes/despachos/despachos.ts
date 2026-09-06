import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import type { Despacho, PaqueteParaDespacho } from '../../modelos/despacho';
import type { Sucursal } from '../../modelos/sucursal';
import { ServicioDespachos } from '../../servicios/despachos.service';
import { ServicioSucursales } from '../../servicios/sucursales.service';

@Component({
  selector: 'app-despachos',
  imports: [ReactiveFormsModule, DatePipe, SelectModule],
  templateUrl: './despachos.html',
  styleUrl: './despachos.css',
})
export class Despachos {
  readonly sucursalIdUsuario = input.required<number>();
  readonly despachos = signal<Despacho[]>([]);
  readonly paquetesDisponibles = signal<PaqueteParaDespacho[]>([]);
  readonly sucursales = signal<Sucursal[]>([]);
  readonly paquetesSeleccionados = signal<PaqueteParaDespacho[]>([]);
  readonly mensaje = signal('');
  readonly guardando = signal(false);
  readonly origen = computed(() =>
    this.sucursales().find((sucursal) => sucursal.sucursalId === this.sucursalIdUsuario()),
  );
  readonly formulario = new FormGroup({
    placa: new FormControl('', [Validators.required, Validators.minLength(5), Validators.maxLength(15)]),
    conductor: new FormControl('', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]),
    puntoDestinoId: new FormControl<number | null>(null, Validators.required),
    numeroGuia: new FormControl(''),
  });

  constructor(
    private readonly servicio: ServicioDespachos,
    servicioSucursales: ServicioSucursales,
  ) {
    servicioSucursales.listar().subscribe({ next: (sucursales) => this.sucursales.set(sucursales) });
    this.cargar();
  }

  cargar(): void {
    this.servicio.listar().subscribe({ next: (despachos) => this.despachos.set(despachos) });
    this.servicio.listarPaquetesDisponibles().subscribe({
      next: (paquetes) => this.paquetesDisponibles.set(paquetes),
      error: () => this.mensaje.set('No fue posible cargar los paquetes disponibles.'),
    });
  }

  agregarGuia(): void {
    const valor = this.formulario.controls.numeroGuia.value?.trim().toUpperCase();
    if (!valor) return;
    const paquete = this.paquetesDisponibles().find((registro) =>
      registro.numeroGuia.toUpperCase() === valor || registro.numeroGuia.endsWith(valor),
    );
    if (!paquete) {
      this.mensaje.set('La guía no está disponible para despacho.');
      return;
    }
    if (this.paquetesSeleccionados().some((registro) => registro.envioId === paquete.envioId)) {
      this.formulario.controls.numeroGuia.reset('');
      return;
    }
    const destinoActual = this.formulario.controls.puntoDestinoId.value;
    if (destinoActual && destinoActual !== paquete.puntoDestinoId) {
      this.mensaje.set('Las guías del envío deben tener el mismo destino.');
      return;
    }
    this.formulario.controls.puntoDestinoId.setValue(paquete.puntoDestinoId);
    this.paquetesSeleccionados.update((paquetes) => [...paquetes, paquete]);
    this.formulario.controls.numeroGuia.reset('');
    this.mensaje.set('');
  }

  quitarPaquete(envioId: number): void {
    this.paquetesSeleccionados.update((paquetes) => paquetes.filter((paquete) => paquete.envioId !== envioId));
    if (this.paquetesSeleccionados().length === 0) this.formulario.controls.puntoDestinoId.reset();
  }

  guardar(): void {
    if (this.formulario.invalid || this.paquetesSeleccionados().length === 0 || this.guardando()) {
      this.formulario.markAllAsTouched();
      if (this.paquetesSeleccionados().length === 0) this.mensaje.set('Agrega al menos una guía.');
      return;
    }
    const placa = this.formulario.controls.placa.value!.trim().toUpperCase();
    const conductor = this.formulario.controls.conductor.value!.trim();
    const puntoDestinoId = this.formulario.controls.puntoDestinoId.value!;
    this.guardando.set(true);
    this.mensaje.set('');
    this.servicio.crear({
      placa,
      conductor,
      puntoDestinoId,
      envioIds: this.paquetesSeleccionados().map((paquete) => paquete.envioId),
    }).subscribe({
      next: (despacho) => {
        this.despachos.update((despachos) => [despacho, ...despachos]);
        this.formulario.reset();
        this.paquetesSeleccionados.set([]);
        this.guardando.set(false);
        this.mensaje.set('Envío registrado.');
        this.cargar();
      },
      error: () => {
        this.guardando.set(false);
        this.mensaje.set('No fue posible registrar el envío. Revisa las guías seleccionadas.');
      },
    });
  }
}
