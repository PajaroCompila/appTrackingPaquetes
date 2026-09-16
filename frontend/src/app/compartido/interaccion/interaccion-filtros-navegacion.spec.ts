import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { SelectorAlmacenesDirective } from './selector-almacenes.directive';
import { CerrarTooltipNavegacionDirective } from './cerrar-tooltip-navegacion.directive';

@Component({
  imports: [SelectorAlmacenesDirective, CerrarTooltipNavegacionDirective],
  template: `
    <nav appCerrarTooltipNavegacion>
      <a href="/pedidos"><i></i><span class="etiqueta-nav">Pedidos</span></a>
      <button type="button"><span class="etiqueta-nav">Cerrar sesión</span></button>
    </nav>
    <form (submit)="abiertoAlBuscar = selector.open; $event.preventDefault()">
      <details appSelectorAlmacenes #selector>
        <summary>Almacenes</summary>
        <fieldset><label><input type="checkbox" value="BSPS02">BSPS02</label></fieldset>
      </details>
      <button type="submit">Buscar</button>
      <button type="button">Limpiar filtros</button>
    </form>
  `,
})
class PruebaInteraccion {
  public abiertoAlBuscar: boolean | null = null;
}

describe('Interacción compartida de filtros y navegación', () => {
  let fixture: ComponentFixture<PruebaInteraccion>;
  let selector: HTMLDetailsElement;
  let eventos: Subject<NavigationStart>;

  beforeEach(async () => {
    eventos = new Subject();
    await TestBed.configureTestingModule({
      imports: [PruebaInteraccion],
      providers: [{ provide: Router, useValue: { events: eventos } }],
    }).compileComponents();
    fixture = TestBed.createComponent(PruebaInteraccion);
    fixture.detectChanges();
    selector = fixture.nativeElement.querySelector('details');
    selector.open = true;
  });

  it('mantiene abierto el selector al marcar y desmarcar, sin impedir el checkbox', () => {
    const checkbox = selector.querySelector<HTMLInputElement>('input')!;
    checkbox.click();
    expect(checkbox.checked).toBe(true);
    expect(selector.open).toBe(true);
    checkbox.click();
    expect(checkbox.checked).toBe(false);
    expect(selector.open).toBe(true);
  });

  it('cierra antes de Buscar y conserva las selecciones', () => {
    const checkbox = selector.querySelector<HTMLInputElement>('input')!;
    checkbox.checked = true;
    fixture.nativeElement.querySelector('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(fixture.componentInstance.abiertoAlBuscar).toBe(false);
    expect(selector.open).toBe(false);
    expect(checkbox.checked).toBe(true);
  });

  it('cierra con Limpiar filtros o clic fuera, sin cambiar valores por su cuenta', () => {
    const limpiar = fixture.nativeElement.querySelector('form button[type=button]');
    // El fixture está fuera del document, como es habitual en TestBed.
    document.body.appendChild(fixture.nativeElement);
    limpiar.click();
    expect(selector.open).toBe(false);
    selector.open = true;
    document.body.click();
    expect(selector.open).toBe(false);
  });

  it('cierra al navegar, incluidos cambios de query params', () => {
    eventos.next(new NavigationStart(1, '/historial-validados?pagina=2'));
    expect(selector.open).toBe(false);
  });

  it('permite cerrar el selector con Escape', () => {
    selector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(selector.open).toBe(false);
  });

  it('retira los listeners de documento y formulario al destruirse', () => {
    const formulario = selector.closest('form')!;
    fixture.destroy();
    selector.open = true;
    document.body.click();
    formulario.dispatchEvent(new Event('submit', { bubbles: true }));
    eventos.next(new NavigationStart(2, '/pedidos'));
    expect(selector.open).toBe(true);
  });

  it('oculta inmediatamente los tooltips al hacer clic sin impedir la navegación', () => {
    const enlace = fixture.nativeElement.querySelector('nav a');
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    enlace.querySelector('i').dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    const etiquetas = fixture.nativeElement.querySelectorAll('nav .etiqueta-nav');
    expect([...etiquetas].every((etiqueta: HTMLElement) => etiqueta.hidden)).toBe(true);
  });

  it('no reabre el tooltip al mover el puntero entre hijos del icono recién pulsado', () => {
    const enlace = fixture.nativeElement.querySelector('nav a');
    enlace.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const etiqueta = enlace.querySelector('.etiqueta-nav');
    etiqueta.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: enlace }));
    expect(etiqueta.hidden).toBe(true);
  });

  it('restaura el tooltip al volver a entrar con el mouse y con nuevo foco de teclado', () => {
    const enlace = fixture.nativeElement.querySelector('nav a');
    const etiqueta = enlace.querySelector('.etiqueta-nav');
    enlace.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    enlace.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(etiqueta.hidden).toBe(false);
    enlace.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    enlace.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(etiqueta.hidden).toBe(false);
  });

  it('también cierra el tooltip de los botones del sidebar', () => {
    const boton = fixture.nativeElement.querySelector('nav button');
    boton.click();
    expect(boton.querySelector('.etiqueta-nav').hidden).toBe(true);
  });
});
