import type { Sucursal } from "../modelos/usuario.js";
import type { DatosSucursal, RepositorioSucursales } from "../repositorios/sucursales.repositorio.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
import { normalizarTexto } from "../utilidades/normalizar.js";

export class ServicioSucursales {
  constructor(private readonly repositorio: RepositorioSucursales) {}

  listar(): Promise<Sucursal[]> {
    return this.repositorio.listar();
  }

  listarUbicaciones() {
    return this.repositorio.listarUbicaciones();
  }

  async crear(datos: DatosSucursal): Promise<Sucursal> {
    const normalizados = this.normalizar(datos);
    await this.comprobarUbicacion(normalizados);
    await this.comprobarCodigo(normalizados.codigo);
    return this.repositorio.crear(normalizados);
  }

  async actualizar(sucursalId: number, datos: DatosSucursal): Promise<Sucursal> {
    const normalizados = this.normalizar(datos);
    await this.comprobarUbicacion(normalizados);
    const existente = await this.repositorio.buscarPorCodigo(normalizados.codigo);
    if (existente && existente.sucursalId !== sucursalId) throw new ErrorAplicacion(409, "CODIGO_DUPLICADO", "El código ya está registrado");
    const actualizada = await this.repositorio.actualizar(sucursalId, normalizados);
    if (!actualizada) throw new ErrorAplicacion(404, "SUCURSAL_NO_ENCONTRADA", "La sucursal no existe");
    return actualizada;
  }

  private async comprobarCodigo(codigo: string): Promise<void> {
    if (await this.repositorio.buscarPorCodigo(codigo)) throw new ErrorAplicacion(409, "CODIGO_DUPLICADO", "El código ya está registrado");
  }

  private normalizar(datos: DatosSucursal): DatosSucursal {
    return { ...datos, nombre: normalizarTexto(datos.nombre), direccion: normalizarTexto(datos.direccion), departamentoCodigo: datos.departamentoCodigo.trim(), ciudadCodigo: datos.ciudadCodigo.trim(), codigo: datos.codigo.trim().toUpperCase(), telefono: datos.telefono.trim() };
  }

  private async comprobarUbicacion(datos: DatosSucursal): Promise<void> {
    if (!(await this.repositorio.ubicacionValida(datos.departamentoCodigo, datos.ciudadCodigo))) {
      throw new ErrorAplicacion(400, "UBICACION_INVALIDA", "La ciudad no corresponde al departamento seleccionado");
    }
  }
}
