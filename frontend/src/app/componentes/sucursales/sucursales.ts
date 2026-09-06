import { CommonModule } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import type { Ciudad, DatosSucursal, Departamento, Sucursal } from '../../modelos/sucursal';
import { ServicioSucursales } from '../../servicios/sucursales.service';

@Component({
  selector: 'app-sucursales',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './sucursales.html',
  styleUrl: './sucursales.css',
})
export class Sucursales {
  readonly puedeEditar = input(false);
  readonly sucursales = signal<Sucursal[]>([]);
  readonly editando = signal<Sucursal | null>(null);
  readonly cargando = signal(true);
  readonly mensaje = signal('');
  readonly listaVisible = signal(false);
  readonly departamentos = signal<Departamento[]>([]);
  readonly ciudades = signal<Ciudad[]>([]);
  readonly departamentoSeleccionado = signal('');
  readonly ciudadesDisponibles = computed(() => this.ciudades().filter((ciudad) => ciudad.departamentoCodigo === this.departamentoSeleccionado()));
  readonly tituloFormulario = computed(() =>
    this.editando() ? 'Editar destino' : 'Nuevo destino',
  );
  readonly formulario = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    codigo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(20)],
    }),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    departamentoCodigo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    ciudadCodigo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)],
    }),
  });

  constructor(private readonly servicio: ServicioSucursales) {
    this.servicio.listarUbicaciones().subscribe({
      next: (catalogo) => { this.departamentos.set(catalogo.departamentos); this.ciudades.set(catalogo.ciudades); },
      error: () => this.mensaje.set('No fue posible cargar los departamentos y ciudades'),
    });
    this.formulario.controls.departamentoCodigo.valueChanges.subscribe((codigo) => {
      this.departamentoSeleccionado.set(codigo);
      const ciudadActual = this.formulario.controls.ciudadCodigo.value;
      if (ciudadActual && !this.ciudades().some((ciudad) => ciudad.codigo === ciudadActual && ciudad.departamentoCodigo === codigo)) {
        this.formulario.controls.ciudadCodigo.setValue('');
      }
    });
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.mensaje.set('');
    this.servicio.listar().subscribe({
      next: (resultado) => {
        this.sucursales.set(resultado);
        this.cargando.set(false);
      },
      error: () => {
        this.mensaje.set('No fue posible cargar las sucursales');
        this.cargando.set(false);
      },
    });
  }

  editar(sucursal: Sucursal): void {
    this.listaVisible.set(false);
    this.editando.set(sucursal);
    this.departamentoSeleccionado.set(sucursal.departamentoCodigo);
    this.formulario.patchValue(sucursal);
  }

  cancelar(): void {
    this.editando.set(null);
    this.formulario.reset();
  }

  cambiarVista(): void {
    this.listaVisible.update((visible) => !visible);
    if (this.listaVisible()) this.cargar();
  }

  guardar(): void {
    if (!this.puedeEditar() || this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.mensaje.set('');
    const datos = this.formulario.getRawValue() as DatosSucursal;
    const operacion = this.editando()
      ? this.servicio.actualizar(this.editando()!.sucursalId, datos)
      : this.servicio.crear(datos);
    operacion.subscribe({
      next: () => {
        this.cancelar();
        this.listaVisible.set(true);
        this.cargar();
      },
      error: () => this.mensaje.set('No fue posible guardar la sucursal'),
    });
  }
}
