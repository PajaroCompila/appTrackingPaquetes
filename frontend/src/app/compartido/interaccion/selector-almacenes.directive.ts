import { DOCUMENT } from '@angular/common';
import { AfterViewInit, DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';

@Directive({ selector: 'details[appSelectorAlmacenes]' })
export class SelectorAlmacenesDirective implements AfterViewInit {
  private readonly elemento = inject<ElementRef<HTMLDetailsElement>>(ElementRef);
  private readonly documento = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  public ngAfterViewInit(): void {
    const selector = this.elemento.nativeElement;
    const formulario = selector.closest('form');
    const cerrar = (): void => { selector.open = false; };
    const cerrarFuera = (evento: Event): void => {
      if (evento.target instanceof Node && !selector.contains(evento.target)) cerrar();
    };
    const cerrarConEscape = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') cerrar();
    };

    // Captura: cerrar antes de que Buscar ejecute el ngSubmit del formulario.
    formulario?.addEventListener('submit', cerrar, true);
    this.documento.addEventListener('click', cerrarFuera, true);
    selector.addEventListener('keydown', cerrarConEscape);
    this.router.events?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((evento) => {
      if (evento instanceof NavigationStart) cerrar();
    });
    this.destroyRef.onDestroy(() => {
      formulario?.removeEventListener('submit', cerrar, true);
      this.documento.removeEventListener('click', cerrarFuera, true);
      selector.removeEventListener('keydown', cerrarConEscape);
    });
  }
}
