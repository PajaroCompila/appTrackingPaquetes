import { AfterViewInit, Component, ElementRef, input, viewChild } from '@angular/core';
import JsBarcode from 'jsbarcode';

@Component({ selector: 'app-codigo-barras', template: '<svg #lienzo role="img" [attr.aria-label]="\'Código de barras de la guía \'+valor()"></svg>', styles: [':host{display:block;width:190px;max-width:100%}svg{display:block;width:100%;height:auto}'] })
export class CodigoBarras implements AfterViewInit {
  readonly valor = input.required<string>();
  private readonly lienzo = viewChild.required<ElementRef<SVGElement>>('lienzo');
  ngAfterViewInit(): void { JsBarcode(this.lienzo().nativeElement, this.valor(), { format: 'CODE128', width: 1.35, height: 42, margin: 0, displayValue: true, fontSize: 11, lineColor: '#14295a', background: 'transparent' }); }
}
