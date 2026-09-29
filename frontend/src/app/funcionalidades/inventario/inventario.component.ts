import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import type { InventarioArticulo } from '../pedidos/pedido.interface';
import { PedidosService } from '../pedidos/pedidos.service';

type EstadoInventario = 'inicial' | 'cargando' | 'datos' | 'no-encontrado' | 'error';
type ResultadoConsulta =
  | { estado: 'datos'; inventario: InventarioArticulo }
  | { estado: 'no-encontrado' | 'error'; inventario: null };

@Component({
  selector: 'app-inventario',
  imports: [CommonModule, FormsModule],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.css',
})
export class InventarioComponent implements OnInit, AfterViewInit {
  private readonly pedidos = inject(PedidosService);
  private readonly destruir = inject(DestroyRef);
  private readonly consultas = new Subject<string>();

  @ViewChild('codigoInput') private codigoInput?: ElementRef<HTMLInputElement>;

  public codigoArticulo = '';
  public readonly estado = signal<EstadoInventario>('inicial');
  public readonly inventario = signal<InventarioArticulo | null>(null);
  public readonly codigoConsultado = signal('');
  public readonly existenciaTotal = computed(() => this.inventario()?.existencias.reduce(
    (total, existencia) => total + Number(existencia.existenciaFisica || 0), 0,
  ) ?? 0);
  public readonly bodegasConExistencia = computed(() => this.inventario()?.existencias.filter(
    ({ existenciaFisica }) => Number(existenciaFisica) > 0,
  ).length ?? 0);

  public ngOnInit(): void {
    this.consultas.pipe(
      switchMap((codigoArticulo) => {
        this.estado.set('cargando');
        this.inventario.set(null);
        return this.pedidos.obtenerInventarioArticulo(codigoArticulo).pipe(
          map((inventario): ResultadoConsulta => ({ estado: 'datos', inventario })),
          catchError((error: HttpErrorResponse): Observable<ResultadoConsulta> => of({
            estado: error.status === 404 ? 'no-encontrado' : 'error',
            inventario: null,
          })),
        );
      }),
      takeUntilDestroyed(this.destruir),
    ).subscribe((resultado) => {
      this.estado.set(resultado.estado);
      this.inventario.set(resultado.inventario);
      this.enfocarBuscador(true);
    });
  }

  public ngAfterViewInit(): void {
    this.enfocarBuscador();
  }

  public buscar(): void {
    const codigo = this.codigoArticulo.trim();
    if (!codigo || this.estado() === 'cargando') {
      this.enfocarBuscador();
      return;
    }
    this.codigoArticulo = codigo;
    this.codigoConsultado.set(codigo);
    this.consultas.next(codigo);
  }

  public formatearUnidades(cantidad: number): string {
    return new Intl.NumberFormat('es-HN', { maximumFractionDigits: 2 }).format(cantidad);
  }

  public claseDisponibilidad(existencia: number): string {
    if (existencia <= 0) return 'sin-existencia';
    return existencia < 10 ? 'existencia-baja' : 'con-existencia';
  }

  public textoDisponibilidad(existencia: number): string {
    if (existencia <= 0) return 'Sin existencia';
    return existencia < 10 ? 'Existencia baja' : 'Con existencia';
  }

  private enfocarBuscador(seleccionar = false): void {
    setTimeout(() => {
      const input = this.codigoInput?.nativeElement;
      input?.focus();
      if (seleccionar) input?.select();
    });
  }
}
