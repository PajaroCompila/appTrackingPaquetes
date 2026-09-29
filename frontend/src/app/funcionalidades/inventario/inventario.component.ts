import { AfterViewInit, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { ConsultaInventarioArticuloService } from '../../compartido/inventario/consulta-inventario-articulo.service';
import type { CoincidenciaInventarioArticulo } from '../pedidos/pedido.interface';
import { PedidosService } from '../pedidos/pedidos.service';

type EstadoBusqueda = 'inicial' | 'buscando' | 'resultados' | 'sin-resultados' | 'error';
type ResultadoBusqueda =
  | { estado: 'resultados'; datos: CoincidenciaInventarioArticulo[] }
  | { estado: 'sin-resultados' | 'error'; datos: [] };

@Component({
  selector: 'app-inventario',
  imports: [FormsModule],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.css',
})
export class InventarioComponent implements OnInit, AfterViewInit {
  private readonly pedidos = inject(PedidosService);
  private readonly consultaInventario = inject(ConsultaInventarioArticuloService);
  private readonly destruir = inject(DestroyRef);
  private readonly consultas = new Subject<string>();

  @ViewChild('terminoInput') private terminoInput?: ElementRef<HTMLInputElement>;

  public terminoBusqueda = '';
  public readonly estado = signal<EstadoBusqueda>('inicial');
  public readonly resultados = signal<readonly CoincidenciaInventarioArticulo[]>([]);
  public readonly indiceActivo = signal(-1);

  public ngOnInit(): void {
    this.consultas.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((termino) => {
        this.estado.set('buscando');
        this.resultados.set([]);
        this.indiceActivo.set(-1);
        return this.pedidos.buscarArticulosInventario(termino).pipe(
          map(({ datos }): ResultadoBusqueda => datos.length
            ? { estado: 'resultados', datos }
            : { estado: 'sin-resultados', datos: [] }),
          catchError(() => of<ResultadoBusqueda>({ estado: 'error', datos: [] })),
        );
      }),
      takeUntilDestroyed(this.destruir),
    ).subscribe(({ estado, datos }) => {
      this.estado.set(estado);
      this.resultados.set(datos);
      this.indiceActivo.set(-1);
    });
  }

  public ngAfterViewInit(): void {
    setTimeout(() => this.terminoInput?.nativeElement.focus());
  }

  public alCambiarTermino(valor: string): void {
    const termino = valor.trim();
    if (termino.length < 2) {
      this.estado.set('inicial');
      this.resultados.set([]);
      this.indiceActivo.set(-1);
      return;
    }
    this.consultas.next(termino);
  }

  public buscar(): void {
    const termino = this.terminoBusqueda.trim();
    if (termino.length < 2) return;
    const activos = this.resultados();
    const seleccionado = activos[this.indiceActivo()]
      ?? activos.find(({ codigoArticulo }) => codigoArticulo.toLocaleLowerCase() === termino.toLocaleLowerCase())
      ?? (activos.length === 1 ? activos[0] : undefined);
    if (seleccionado) {
      this.seleccionar(seleccionado);
      return;
    }
    this.consultas.next(termino);
  }

  public seleccionar(articulo: CoincidenciaInventarioArticulo): void {
    this.terminoBusqueda = articulo.codigoArticulo;
    this.indiceActivo.set(this.resultados().indexOf(articulo));
    this.consultaInventario.abrir(articulo.codigoArticulo, undefined);
  }

  public manejarTeclado(evento: KeyboardEvent): void {
    const cantidad = this.resultados().length;
    if (evento.key === 'Escape') {
      this.resultados.set([]);
      this.estado.set('inicial');
      this.indiceActivo.set(-1);
      return;
    }
    if (!cantidad || !['ArrowDown', 'ArrowUp'].includes(evento.key)) return;
    evento.preventDefault();
    const incremento = evento.key === 'ArrowDown' ? 1 : -1;
    const siguiente = this.indiceActivo() < 0
      ? (incremento > 0 ? 0 : cantidad - 1)
      : (this.indiceActivo() + incremento + cantidad) % cantidad;
    this.indiceActivo.set(siguiente);
    setTimeout(() => document.getElementById(`resultado-inventario-${siguiente}`)?.scrollIntoView({ block: 'nearest' }));
  }
}
