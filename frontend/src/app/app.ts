import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AutenticacionService } from './funcionalidades/autenticacion/autenticacion.service';
import { ConsultaInventarioArticuloHostComponent } from './compartido/inventario/consulta-inventario-articulo-host.component';
import { ConsultaInventarioArticuloService } from './compartido/inventario/consulta-inventario-articulo.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ConsultaInventarioArticuloHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  private readonly autenticacion = inject(AutenticacionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly consultaInventario = inject(ConsultaInventarioArticuloService);
  public readonly esLogin = signal(this.router.url.startsWith('/login'));
  public readonly usuario = this.autenticacion.usuario;

  public constructor() {
    this.router.events.pipe(
      filter((evento): evento is NavigationStart => evento instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.consultaInventario.cerrar());
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((evento) => this.esLogin.set(evento.urlAfterRedirects.startsWith('/login')));
  }

  public cerrarSesion(): void {
    this.autenticacion.cerrarSesion().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => undefined,
    });
  }
}
