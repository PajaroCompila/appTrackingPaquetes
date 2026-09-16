import { Directive, ElementRef, HostListener, inject } from '@angular/core';

@Directive({ selector: 'nav[appCerrarTooltipNavegacion]' })
export class CerrarTooltipNavegacionDirective {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  private control(evento: Event): HTMLElement | null {
    const control = evento.target instanceof Element ? evento.target.closest<HTMLElement>('a, button') : null;
    return control && this.elemento.nativeElement.contains(control) ? control : null;
  }

  @HostListener('click', ['$event'])
  public cerrar(evento: Event): void {
    if (!this.control(evento)) return;
    this.elemento.nativeElement.querySelectorAll<HTMLElement>('.etiqueta-nav')
      .forEach((etiqueta) => { etiqueta.hidden = true; });
  }

  @HostListener('mouseover', ['$event'])
  public restaurarHover(evento: MouseEvent): void {
    const control = this.control(evento);
    if (!control || (evento.relatedTarget instanceof Node && control.contains(evento.relatedTarget))) return;
    const etiqueta = control.querySelector<HTMLElement>('.etiqueta-nav');
    if (etiqueta) etiqueta.hidden = false;
  }

  @HostListener('focusin', ['$event'])
  public restaurarFoco(evento: FocusEvent): void {
    const etiqueta = this.control(evento)?.querySelector<HTMLElement>('.etiqueta-nav');
    if (etiqueta) etiqueta.hidden = false;
  }
}
