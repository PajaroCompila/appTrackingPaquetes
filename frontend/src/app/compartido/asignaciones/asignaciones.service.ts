import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  AsignacionArticulo,
  IdentidadArticuloAsignacion,
  TecnicoAsignable,
} from './asignacion.interface';

@Injectable({ providedIn: 'root' })
export class AsignacionesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.urlApi}/pedidos/asignaciones`;

  public obtenerUsuarios() {
    return this.http.get<{ datos: TecnicoAsignable[]; puedeAsignar: boolean }>(
      `${this.url}/usuarios`,
    );
  }

  public consultar(lineas: readonly IdentidadArticuloAsignacion[]) {
    if (lineas.length === 0) return of({ datos: [] as AsignacionArticulo[] });
    const grupos: IdentidadArticuloAsignacion[][] = [];
    for (let inicio = 0; inicio < lineas.length; inicio += 100) {
      grupos.push(lineas.slice(inicio, inicio + 100));
    }
    return forkJoin(grupos.map((grupo) => this.http.post<{ datos: AsignacionArticulo[] }>(
      `${this.url}/consultar`, { lineas: grupo },
    ))).pipe(map((respuestas) => ({ datos: respuestas.flatMap(({ datos }) => datos) })));
  }

  public guardar(linea: IdentidadArticuloAsignacion, usuarioAsignado: string | null) {
    return this.http.patch<{ datos: AsignacionArticulo }>(
      this.url, { ...linea, usuarioAsignado },
    );
  }
}
