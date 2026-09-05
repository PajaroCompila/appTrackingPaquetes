import { Directive, HostBinding, HostListener, Input, inject } from '@angular/core';
import { ConsultaInventarioArticuloService } from './consulta-inventario-articulo.service';

@Directive({
  selector: '[appCodigoArticuloInventario]',
})
export class CodigoArticuloInventarioDirective {
  private readonly consultaInventario = inject(ConsultaInventarioArticuloService);

  @Input({ required: true }) public appCodigoArticuloInventario: string | null | undefined;
  @Input({ required: true }) public codigoAlmacenInventario: string | null | undefined;

  @HostBinding('class.codigo-inventario-consultable')
  public get consultable(): boolean {
    return Boolean(this.codigoArticulo && this.codigoAlmacen);
  }

  @HostBinding('attr.role')
  public get rol(): string | null {
    return this.consultable ? 'button' : null;
  }

  @HostBinding('attr.tabindex')
  public get indiceTabulacion(): number | null {
    return this.consultable ? 0 : null;
  }

  @HostBinding('attr.aria-label')
  public get etiquetaAccesible(): string | null {
    return this.consultable
      ? `Consultar inventario del artículo ${this.codigoArticulo}`
      : null;
  }

  @HostListener('dblclick', ['$event'])
  public abrirConDobleClic(evento: Event): void {
    this.abrir(evento);
  }

  @HostListener('keydown.enter', ['$event'])
  @HostListener('keydown.space', ['$event'])
  public abrirConTeclado(evento: Event): void {
    evento.preventDefault();
    this.abrir(evento);
  }

  private abrir(evento: Event): void {
    if (!this.consultable) return;
    evento.stopPropagation();
    this.consultaInventario.abrir(this.codigoArticulo, this.codigoAlmacen);
  }

  private get codigoArticulo(): string {
    return this.appCodigoArticuloInventario?.trim() ?? '';
  }

  private get codigoAlmacen(): string {
    return this.codigoAlmacenInventario?.trim() ?? '';
  }
}
