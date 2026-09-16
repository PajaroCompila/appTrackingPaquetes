import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type ElementoPaginacion = number | 'separador';

@Component({
  selector: 'app-paginacion',
  templateUrl: './paginacion.component.html',
  styleUrl: './paginacion.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginacionComponent {
  public readonly paginaActual = input.required<number>();
  public readonly totalRegistros = input.required<number>();
  public readonly cantidadPorPagina = input.required<number>();
  public readonly etiquetaRegistros = input('registros');
  public readonly deshabilitada = input(false);
  public readonly paginaSeleccionada = output<number>();

  public readonly totalPaginas = computed(() => Math.max(
    1,
    Math.ceil(this.totalRegistros() / Math.max(1, this.cantidadPorPagina())),
  ));

  public readonly paginas = computed<ElementoPaginacion[]>(() => {
    const total = this.totalPaginas();
    const actual = Math.min(Math.max(1, this.paginaActual()), total);
    if (total <= 7) return Array.from({ length: total }, (_, indice) => indice + 1);
    if (actual <= 4) return [1, 2, 3, 4, 5, 'separador', total];
    if (actual >= total - 3) {
      return [1, 'separador', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, 'separador', actual - 1, actual, actual + 1, 'separador', total];
  });

  public irA(pagina: number): void {
    if (this.deshabilitada() || pagina === this.paginaActual()
      || pagina < 1 || pagina > this.totalPaginas()) return;
    this.paginaSeleccionada.emit(pagina);
  }
}
