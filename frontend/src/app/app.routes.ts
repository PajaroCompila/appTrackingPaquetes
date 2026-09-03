import { Routes } from '@angular/router';
import { administradorGuard, autenticacionGuard, sesionGuard } from './funcionalidades/autenticacion/autenticacion.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pedidos' },
  { path: 'login', loadComponent: () => import('./funcionalidades/autenticacion/login.component').then(({ LoginComponent }) => LoginComponent) },
  { path: 'cambiar-contrasena', canActivate: [sesionGuard], loadComponent: () => import('./funcionalidades/autenticacion/cambiar-contrasena.component').then(({ CambiarContrasenaComponent }) => CambiarContrasenaComponent) },
  { path: 'dashboard', canActivate: [autenticacionGuard, administradorGuard], loadComponent: () =>
    import('./funcionalidades/dashboard/dashboard.component').then(({ DashboardComponent }) => DashboardComponent) },
  { path: 'dashboard/sucursal/:codigoSucursal', canActivate: [autenticacionGuard, administradorGuard], loadComponent: () =>
    import('./funcionalidades/dashboard/ventas-vendedor.component').then(({ VentasVendedorComponent }) => VentasVendedorComponent) },
  {
    path: 'pedidos',
    canActivate: [autenticacionGuard],
    loadComponent: () =>
      import('./funcionalidades/pedidos/lista-pedidos.component').then(
        ({ ListaPedidosComponent }) => ListaPedidosComponent,
      ),
  },
  {
    path: 'pedidos-despachados',
    canActivate: [autenticacionGuard],
    loadComponent: () =>
      import('./funcionalidades/pedidos-despachados/pedidos-despachados.component').then(
        ({ PedidosDespachadosComponent }) => PedidosDespachadosComponent,
      ),
  },
  { path: 'pedidos-despachados/:idOrigen', canActivate: [autenticacionGuard], loadComponent: () => import('./funcionalidades/pedidos-despachados/pedidos-despachados.component').then(({PedidosDespachadosComponent})=>PedidosDespachadosComponent) },
  {
    path: 'historial-validados',
    canActivate: [autenticacionGuard],
    loadComponent: () =>
      import('./funcionalidades/historial/historial.component').then(
        ({ HistorialComponent }) => HistorialComponent,
      ),
  },
  {
    path: 'historial-validados/:idOrigen',
    canActivate: [autenticacionGuard],
    loadComponent: () => import('./funcionalidades/historial/historial.component')
      .then(({ HistorialComponent }) => HistorialComponent),
  },
  {
    path: 'pedidos/:folioPedido',
    canActivate: [autenticacionGuard],
    loadComponent: () =>
      import('./funcionalidades/pedidos/detalle-pedido.component').then(
        ({ DetallePedidoComponent }) => DetallePedidoComponent,
      ),
  },
  { path: 'configuracion/usuarios', canActivate: [autenticacionGuard, administradorGuard],
    loadComponent: () => import('./funcionalidades/usuarios/usuarios.component').then(({UsuariosComponent})=>UsuariosComponent) },
  { path: 'prueba-microinteracciones', canActivate: [autenticacionGuard, administradorGuard],
    loadComponent: () => import('./funcionalidades/pruebas/microinteracciones-prueba.component')
      .then(({ MicrointeraccionesPruebaComponent }) => MicrointeraccionesPruebaComponent) },
  { path: '**', redirectTo: 'pedidos' },
];
