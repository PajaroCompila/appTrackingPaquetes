import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { CodigoRol, PersonalAsignableLocal, RolLocal, UsuarioLocal } from './usuario.interface';
import type { Almacen } from '../pedidos/almacen.interface';

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.urlApi}/usuarios`;

  public listar(filtros: { busqueda: string; rol: string; activo: string;
    pagina: number; cantidadPorPagina: number }) {
    let parametros = new HttpParams().set('pagina', filtros.pagina)
      .set('cantidadPorPagina', filtros.cantidadPorPagina);
    if (filtros.busqueda) parametros = parametros.set('busqueda', filtros.busqueda);
    if (filtros.rol) parametros = parametros.set('rol', filtros.rol);
    if (filtros.activo) parametros = parametros.set('activo', filtros.activo);
    return this.http.get<{ datos: UsuarioLocal[]; paginacion: {
      totalRegistros: number; hayMas: boolean } }>(this.url, { params: parametros });
  }

  public roles() { return this.http.get<{ datos: RolLocal[] }>(`${this.url}/roles`); }
  public almacenes() { return this.http.get<{ datos: Almacen[] }>(`${this.url}/almacenes-disponibles`); }
  public listarPersonalAsignable() {
    return this.http.get<{ datos: PersonalAsignableLocal[] }>(`${this.url}/personal-asignable`);
  }
  public crearPersonalAsignable(datos: { nombre: string; apellido: string }) {
    return this.http.post<{ datos: PersonalAsignableLocal }>(`${this.url}/personal-asignable`, datos);
  }
  public crear(datos: { nombreCompleto: string; nombreUsuario: string; correo: string;
    codigoRol: CodigoRol; contrasena: string; confirmarContrasena: string; activo: boolean }) {
    return this.http.post<{ datos: UsuarioLocal }>(this.url, datos);
  }
  public editar(id: string, datos: { nombreCompleto: string; nombreUsuario: string;
    correo: string; codigoRol: CodigoRol }) {
    return this.http.patch<{ datos: UsuarioLocal }>(`${this.url}/${id}`, {
      nombreCompleto: datos.nombreCompleto, nombreUsuario: datos.nombreUsuario,
      correo: datos.correo, codigoRol: datos.codigoRol,
    });
  }
  public guardarAlmacenes(id: string, codigosAlmacen: string[]) {
    return this.http.put<{ datos: UsuarioLocal }>(`${this.url}/${id}/almacenes`, { codigosAlmacen });
  }
  public estado(id: string, activo: boolean) {
    return this.http.patch<{ datos: UsuarioLocal }>(`${this.url}/${id}/estado`, { activo });
  }
  public eliminar(id: string) { return this.http.delete<void>(`${this.url}/${id}`); }
  public restablecer(id: string, contrasena: string, confirmarContrasena: string) {
    return this.http.post<void>(`${this.url}/${id}/restablecer-contrasena`, {
      contrasena, confirmarContrasena,
    });
  }
}
