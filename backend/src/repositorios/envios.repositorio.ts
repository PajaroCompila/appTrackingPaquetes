import sql from "mssql";
import type { Configuracion } from "../configuracion/entorno.js";
import { obtenerConexion } from "../baseDatos/conexion.js";
import type { ActualizacionEnvio, DatosEnvio, Envio, SeguimientoEnvio, DatosRecepcion, RecepcionEnvio } from "../modelos/envio.js";
import type { IdentidadAutenticada } from "../modelos/usuario.js";

const columnas = `e.envioId, e.numeroGuia, e.puntoOrigenId, origen.nombre AS puntoOrigen,
  e.puntoDestinoId, destino.nombre AS puntoDestino, e.usuarioQueRegistraId,
  e.nombreRemitente, e.telefonoRemitente, e.nombreDestinatario, e.telefonoDestinatario,
  e.descripcion, e.cantidadPaquetes, e.estadoActual, e.fechaCreacion`;

export interface RepositorioEnvios {
  listar(identidad: IdentidadAutenticada): Promise<Envio[]>;
  crear(numeroGuia: string, usuarioId: number, datos: DatosEnvio): Promise<Envio>;
  actualizar(envioId: number, identidad: IdentidadAutenticada, datos: ActualizacionEnvio): Promise<Envio | null>;
  eliminar(envioId: number, identidad: IdentidadAutenticada): Promise<boolean>;
  buscarPorGuia(numeroGuia: string, buscarPorTerminacion: boolean): Promise<SeguimientoEnvio | null>;
  listarRecepciones(): Promise<RecepcionEnvio[]>;
  usuariosActivos(): Promise<{usuarioId:number; nombreUsuario:string}[]>;
  registrarRecepcion(datos: DatosRecepcion): Promise<RecepcionEnvio | null>;
}

export class RepositorioEnviosSql implements RepositorioEnvios {
  constructor(private readonly configuracion: Configuracion) {}

  async listar(identidad: IdentidadAutenticada): Promise<Envio[]> {
    const conexion = await obtenerConexion(this.configuracion);
    const solicitud = conexion.request();
    const filtro = identidad.rol === "usuario" ? "WHERE e.usuarioQueRegistraId = @usuarioId" : "";
    if (filtro) solicitud.input("usuarioId", sql.Int, identidad.usuarioId);
    const resultado = await solicitud.query<Envio>(`SELECT ${columnas} FROM dbo.Envios e INNER JOIN dbo.Sucursales origen ON origen.sucursalId = e.puntoOrigenId INNER JOIN dbo.Sucursales destino ON destino.sucursalId = e.puntoDestinoId ${filtro} ORDER BY e.fechaCreacion DESC`);
    return resultado.recordset;
  }

  async crear(numeroGuia: string, usuarioId: number, datos: DatosEnvio): Promise<Envio> {
    const conexion = await obtenerConexion(this.configuracion);
    const solicitud = conexion.request()
      .input("numeroGuia", sql.VarChar(20), numeroGuia)
      .input("usuarioQueRegistraId", sql.Int, usuarioId)
      .input("puntoOrigenId", sql.Int, datos.puntoOrigenId)
      .input("puntoDestinoId", sql.Int, datos.puntoDestinoId)
      .input("nombreRemitente", sql.NVarChar(120), datos.nombreRemitente)
      .input("telefonoRemitente", sql.VarChar(30), datos.telefonoRemitente)
      .input("nombreDestinatario", sql.NVarChar(120), datos.nombreDestinatario)
      .input("telefonoDestinatario", sql.VarChar(30), datos.telefonoDestinatario)
      .input("descripcion", sql.NVarChar(250), datos.descripcion)
      .input("cantidadPaquetes", sql.Int, datos.cantidadPaquetes);
    const resultado = await solicitud.query<Envio>(`INSERT INTO dbo.Envios (numeroGuia, puntoOrigenId, puntoDestinoId, usuarioQueRegistraId, nombreRemitente, telefonoRemitente, nombreDestinatario, telefonoDestinatario, descripcion, cantidadPaquetes) VALUES (@numeroGuia, @puntoOrigenId, @puntoDestinoId, @usuarioQueRegistraId, @nombreRemitente, @telefonoRemitente, @nombreDestinatario, @telefonoDestinatario, @descripcion, @cantidadPaquetes); SELECT ${columnas} FROM dbo.Envios e INNER JOIN dbo.Sucursales origen ON origen.sucursalId = e.puntoOrigenId INNER JOIN dbo.Sucursales destino ON destino.sucursalId = e.puntoDestinoId WHERE e.envioId = SCOPE_IDENTITY()`);
    const creado = resultado.recordset[0];
    if (!creado) throw new Error("No se obtuvo el envío creado");
    return creado;
  }

  async buscarPorGuia(numeroGuia: string, buscarPorTerminacion: boolean): Promise<SeguimientoEnvio | null> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion.request()
      .input("numeroGuia", sql.VarChar(20), numeroGuia)
      .input("terminacion", sql.VarChar(21), `%${numeroGuia}`)
      .query<SeguimientoEnvio>(`SELECT TOP (1) e.numeroGuia, origen.nombre AS puntoOrigen, destino.nombre AS puntoDestino, e.descripcion, e.cantidadPaquetes, e.estadoActual, e.fechaCreacion FROM dbo.Envios e INNER JOIN dbo.Sucursales origen ON origen.sucursalId = e.puntoOrigenId INNER JOIN dbo.Sucursales destino ON destino.sucursalId = e.puntoDestinoId WHERE ${buscarPorTerminacion ? "e.numeroGuia LIKE @terminacion" : "e.numeroGuia = @numeroGuia"} ORDER BY e.fechaCreacion DESC`);
    return resultado.recordset[0] ?? null;
  }

  async actualizar(envioId: number, identidad: IdentidadAutenticada, datos: ActualizacionEnvio): Promise<Envio | null> {
    const conexion = await obtenerConexion(this.configuracion);
    const solicitud = conexion.request()
      .input("envioId", sql.Int, envioId)
      .input("usuarioId", sql.Int, identidad.usuarioId)
      .input("puntoOrigenId", sql.Int, datos.puntoOrigenId)
      .input("puntoDestinoId", sql.Int, datos.puntoDestinoId)
      .input("nombreRemitente", sql.NVarChar(120), datos.nombreRemitente)
      .input("telefonoRemitente", sql.VarChar(30), datos.telefonoRemitente)
      .input("nombreDestinatario", sql.NVarChar(120), datos.nombreDestinatario)
      .input("telefonoDestinatario", sql.VarChar(30), datos.telefonoDestinatario)
      .input("descripcion", sql.NVarChar(250), datos.descripcion)
      .input("cantidadPaquetes", sql.Int, datos.cantidadPaquetes)
      .input("estadoActual", sql.VarChar(20), datos.estadoActual);
    const alcance = identidad.rol === "usuario" ? "AND usuarioQueRegistraId = @usuarioId" : "";
    await solicitud.query(`UPDATE dbo.Envios SET puntoOrigenId = @puntoOrigenId, puntoDestinoId = @puntoDestinoId, nombreRemitente = @nombreRemitente, telefonoRemitente = @telefonoRemitente, nombreDestinatario = @nombreDestinatario, telefonoDestinatario = @telefonoDestinatario, descripcion = @descripcion, cantidadPaquetes = @cantidadPaquetes, estadoActual = @estadoActual WHERE envioId = @envioId ${alcance}`);
    const resultado = await solicitud.query<Envio>(`SELECT ${columnas} FROM dbo.Envios e INNER JOIN dbo.Sucursales origen ON origen.sucursalId = e.puntoOrigenId INNER JOIN dbo.Sucursales destino ON destino.sucursalId = e.puntoDestinoId WHERE e.envioId = @envioId ${identidad.rol === "usuario" ? "AND e.usuarioQueRegistraId = @usuarioId" : ""}`);
    return resultado.recordset[0] ?? null;
  }

  async eliminar(envioId: number, identidad: IdentidadAutenticada): Promise<boolean> {
    const conexion = await obtenerConexion(this.configuracion);
    const solicitud = conexion.request().input("envioId", sql.Int, envioId).input("usuarioId", sql.Int, identidad.usuarioId);
    const alcance = identidad.rol === "usuario" ? "AND usuarioQueRegistraId = @usuarioId" : "";
    const resultado = await solicitud.query(`DELETE FROM dbo.Envios WHERE envioId = @envioId ${alcance}`);
    return (resultado.rowsAffected[0] ?? 0) > 0;
  }
  async listarRecepciones() { const c=await obtenerConexion(this.configuracion); return (await c.request().query<RecepcionEnvio>(`SELECT r.recepcionId,r.envioId,e.numeroGuia,r.usuarioRecibeId,u.nombreUsuario,r.entregaFinal,r.fechaRecepcion FROM dbo.RecepcionesEnvio r JOIN dbo.Envios e ON e.envioId=r.envioId JOIN dbo.Usuarios u ON u.usuarioId=r.usuarioRecibeId ORDER BY r.fechaRecepcion DESC`)).recordset; }
  async usuariosActivos() { const c=await obtenerConexion(this.configuracion); return (await c.request().query<{usuarioId:number;nombreUsuario:string}>(`SELECT usuarioId,nombreUsuario FROM dbo.Usuarios WHERE activo=1 ORDER BY nombreUsuario`)).recordset; }
  async registrarRecepcion(datos: DatosRecepcion) {
    const c=await obtenerConexion(this.configuracion); const t=new sql.Transaction(c); await t.begin();
    try { const q=new sql.Request(t).input('envioId',sql.Int,datos.envioId).input('usuarioRecibeId',sql.Int,datos.usuarioRecibeId);
      const r=await q.query<RecepcionEnvio>(`IF EXISTS(SELECT 1 FROM dbo.Usuarios WHERE usuarioId=@usuarioRecibeId AND activo=1) AND EXISTS(SELECT 1 FROM dbo.Envios WHERE envioId=@envioId AND estadoActual<>'recibido') BEGIN DECLARE @entregaFinal BIT=CASE WHEN EXISTS(SELECT 1 FROM dbo.Envios e JOIN dbo.Usuarios u ON u.usuarioId=@usuarioRecibeId WHERE e.envioId=@envioId AND e.puntoDestinoId=u.sucursalId) THEN 1 ELSE 0 END; INSERT dbo.RecepcionesEnvio(envioId,usuarioRecibeId,entregaFinal) VALUES(@envioId,@usuarioRecibeId,@entregaFinal); UPDATE dbo.Envios SET estadoActual=CASE WHEN @entregaFinal=1 THEN 'recibido' ELSE 'en_transito' END WHERE envioId=@envioId; SELECT r.recepcionId,r.envioId,e.numeroGuia,r.usuarioRecibeId,u.nombreUsuario,r.entregaFinal,r.fechaRecepcion FROM dbo.RecepcionesEnvio r JOIN dbo.Envios e ON e.envioId=r.envioId JOIN dbo.Usuarios u ON u.usuarioId=r.usuarioRecibeId WHERE r.recepcionId=SCOPE_IDENTITY(); END`); await t.commit(); return r.recordset[0]??null;
    } catch(e){await t.rollback();throw e;}
  }
}
