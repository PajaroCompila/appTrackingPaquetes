import { randomInt } from "node:crypto";
import type { ActualizacionEnvio, DatosEnvio, Envio, DatosRecepcion } from "../modelos/envio.js";
import type { IdentidadAutenticada } from "../modelos/usuario.js";
import type { RepositorioEnvios } from "../repositorios/envios.repositorio.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
import { normalizarTexto } from "../utilidades/normalizar.js";

export class ServicioEnvios {
  constructor(private readonly repositorio: RepositorioEnvios) {}

  listar(identidad: IdentidadAutenticada): Promise<Envio[]> {
    return this.repositorio.listar(identidad);
  }

  async crear(identidad: IdentidadAutenticada, datos: DatosEnvio): Promise<Envio> {
    if (identidad.rol !== "administrador" && datos.puntoOrigenId !== identidad.sucursalId) throw new ErrorAplicacion(403, "ORIGEN_NO_PERMITIDO", "El origen debe ser tu sucursal asignada");
    if (datos.puntoOrigenId === datos.puntoDestinoId) throw new ErrorAplicacion(400, "RUTA_INVALIDA", "El origen y el destino deben ser diferentes");
    const normalizados = { ...datos, nombreRemitente: normalizarTexto(datos.nombreRemitente), nombreDestinatario: normalizarTexto(datos.nombreDestinatario), descripcion: normalizarTexto(datos.descripcion), telefonoRemitente: datos.telefonoRemitente.trim(), telefonoDestinatario: datos.telefonoDestinatario.trim() };
    const numeroGuia = `PA-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
    return this.repositorio.crear(numeroGuia, identidad.usuarioId, normalizados);
  }

  async consultar(numeroGuiaRecibido: string) {
    const numeroGuia = numeroGuiaRecibido.trim().toUpperCase();
    const buscarPorTerminacion = /^\d{6}$/.test(numeroGuia);
    if (!buscarPorTerminacion && !/^PA-\d{4}-\d{6}$/.test(numeroGuia))
      throw new ErrorAplicacion(400, "GUIA_INVALIDA", "Ingresa la guía completa o sus últimos seis dígitos");
    const envio = await this.repositorio.buscarPorGuia(numeroGuia, buscarPorTerminacion);
    if (!envio) throw new ErrorAplicacion(404, "GUIA_NO_ENCONTRADA", "No encontramos un envío con ese número de guía");
    return envio;
  }

  async actualizar(identidad: IdentidadAutenticada, envioId: number, datos: ActualizacionEnvio): Promise<Envio> {
    if (identidad.rol !== "administrador" && datos.puntoOrigenId !== identidad.sucursalId) throw new ErrorAplicacion(403, "ORIGEN_NO_PERMITIDO", "El origen debe ser tu sucursal asignada");
    if (datos.puntoOrigenId === datos.puntoDestinoId) throw new ErrorAplicacion(400, "RUTA_INVALIDA", "El origen y el destino deben ser diferentes");
    const normalizados = { ...datos, nombreRemitente: normalizarTexto(datos.nombreRemitente), nombreDestinatario: normalizarTexto(datos.nombreDestinatario), descripcion: normalizarTexto(datos.descripcion), telefonoRemitente: datos.telefonoRemitente.trim(), telefonoDestinatario: datos.telefonoDestinatario.trim() };
    const actualizado = await this.repositorio.actualizar(envioId, identidad, normalizados);
    if (!actualizado) throw new ErrorAplicacion(404, "ENVIO_NO_ENCONTRADO", "El envío no existe");
    return actualizado;
  }

  async eliminar(identidad: IdentidadAutenticada, envioId: number): Promise<void> {
    if (!(await this.repositorio.eliminar(envioId, identidad))) throw new ErrorAplicacion(404, "ENVIO_NO_ENCONTRADO", "El envío no existe");
  }
  listarRecepciones() { return this.repositorio.listarRecepciones(); }
  listarDisponiblesParaRecepcion() { return this.repositorio.listarDisponiblesParaRecepcion(); }
  listarRecibidos(usuarioId: number) { return this.repositorio.listarRecibidos(usuarioId); }
  usuariosActivos() { return this.repositorio.usuariosActivos(); }
  async registrarRecepcion(datos: DatosRecepcion) { const resultado=await this.repositorio.registrarRecepcion(datos); if(!resultado) throw new ErrorAplicacion(400,"RECEPCION_INVALIDA","Verifica el envío y el usuario receptor"); return resultado; }
  async registrarRecepciones(envioIds:number[],usuarioRecibeId:number) { const unicos=[...new Set(envioIds)]; const resultados=[]; for(const envioId of unicos) resultados.push(await this.registrarRecepcion({envioId,usuarioRecibeId})); return resultados; }
}
