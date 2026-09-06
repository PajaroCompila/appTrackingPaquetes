import sql from 'mssql';
import { obtenerConexion } from '../baseDatos/conexion.js';
import type { Configuracion } from '../configuracion/entorno.js';
import type { DatosDespacho, Despacho } from '../modelos/despacho.js';
import type { Envio } from '../modelos/envio.js';
import type { IdentidadAutenticada } from '../modelos/usuario.js';

const columnasPaquete = `e.envioId, e.numeroGuia, e.puntoOrigenId, origen.nombre AS puntoOrigen,
  e.puntoDestinoId, destino.nombre AS puntoDestino, e.usuarioQueRegistraId, creador.nombreUsuario,
  e.nombreRemitente, e.telefonoRemitente, e.nombreDestinatario, e.telefonoDestinatario,
  e.descripcion, e.cantidadPaquetes, e.estadoActual, e.fechaCreacion`;

export class RepositorioDespachosSql {
  constructor(private readonly configuracion: Configuracion) {}

  async listarPaquetesDisponibles(usuarioId: number): Promise<Envio[]> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion.request().input('usuarioId', sql.Int, usuarioId).query<Envio>(`
      SELECT ${columnasPaquete}
      FROM dbo.Envios e
      INNER JOIN dbo.Sucursales origen ON origen.sucursalId = e.puntoOrigenId
      INNER JOIN dbo.Sucursales destino ON destino.sucursalId = e.puntoDestinoId
      INNER JOIN dbo.Usuarios creador ON creador.usuarioId = e.usuarioQueRegistraId
      WHERE e.estadoActual = 'en_transito'
        AND EXISTS (SELECT 1 FROM dbo.RecepcionesEnvio r WHERE r.envioId = e.envioId AND r.usuarioRecibeId = @usuarioId)
        AND NOT EXISTS (
          SELECT 1 FROM dbo.DespachoPaquetes dp
          INNER JOIN dbo.Despachos d ON d.despachoId = dp.despachoId
          WHERE dp.envioId = e.envioId AND d.estado = 'despachado'
        )
      ORDER BY e.fechaCreacion DESC`);
    return resultado.recordset;
  }
  async listar(identidad: IdentidadAutenticada): Promise<Despacho[]> {
    const conexion=await obtenerConexion(this.configuracion);
    const solicitud = conexion.request();
    const filtro = identidad.rol === 'administrador' ? '' : 'WHERE d.usuarioDespachaId=@usuarioId';
    if (filtro) solicitud.input('usuarioId', sql.Int, identidad.usuarioId);
    return (await solicitud.query<Despacho>(`SELECT d.despachoId,d.placa,d.conductor,d.puntoOrigenId,o.nombre puntoOrigen,d.puntoDestinoId,dest.nombre puntoDestino,d.usuarioDespachaId,u.nombreUsuario,d.estado,d.fechaSalida,d.fechaRecepcion,STRING_AGG(e.numeroGuia,', ') guias FROM dbo.Despachos d JOIN dbo.Sucursales o ON o.sucursalId=d.puntoOrigenId JOIN dbo.Sucursales dest ON dest.sucursalId=d.puntoDestinoId JOIN dbo.Usuarios u ON u.usuarioId=d.usuarioDespachaId JOIN dbo.DespachoPaquetes dp ON dp.despachoId=d.despachoId JOIN dbo.Envios e ON e.envioId=dp.envioId ${filtro} GROUP BY d.despachoId,d.placa,d.conductor,d.puntoOrigenId,o.nombre,d.puntoDestinoId,dest.nombre,d.usuarioDespachaId,u.nombreUsuario,d.estado,d.fechaSalida,d.fechaRecepcion ORDER BY d.fechaSalida DESC`)).recordset;
  }
  async crear(identidad: IdentidadAutenticada, datos: DatosDespacho): Promise<Despacho | null> {
    const conexion=await obtenerConexion(this.configuracion); const transaccion=new sql.Transaction(conexion); await transaccion.begin();
    try {
      const ids=datos.envioIds; const solicitud=new sql.Request(transaccion).input('placa',sql.VarChar(15),datos.placa).input('conductor',sql.NVarChar(120),datos.conductor).input('origen',sql.Int,identidad.sucursalId).input('destino',sql.Int,datos.puntoDestinoId).input('usuario',sql.Int,identidad.usuarioId);
      const valores=ids.map((_,i)=>`(@e${i})`).join(','); ids.forEach((id,i)=>solicitud.input(`e${i}`,sql.Int,id));
      const validos=await solicitud.query<{cantidad:number}>(`SELECT COUNT(DISTINCT e.envioId) cantidad FROM dbo.Envios e JOIN dbo.RecepcionesEnvio r ON r.envioId=e.envioId WHERE r.usuarioRecibeId=@usuario AND e.envioId IN (SELECT v.id FROM (VALUES ${valores}) v(id)) AND e.estadoActual='en_transito' AND e.puntoDestinoId=@destino AND NOT EXISTS (SELECT 1 FROM dbo.DespachoPaquetes dp2 JOIN dbo.Despachos d2 ON d2.despachoId=dp2.despachoId WHERE dp2.envioId=e.envioId AND d2.estado='despachado')`);
      if ((validos.recordset[0]?.cantidad??0)!==ids.length) { await transaccion.rollback(); return null; }
      const creado=await solicitud.query<{despachoId:number}>(`INSERT dbo.Despachos(placa,conductor,puntoOrigenId,puntoDestinoId,usuarioDespachaId) OUTPUT inserted.despachoId VALUES(@placa,@conductor,@origen,@destino,@usuario)`); const id=creado.recordset[0]!.despachoId;
      const detalle=new sql.Request(transaccion).input('despachoId',sql.Int,id); ids.forEach((x,i)=>detalle.input(`e${i}`,sql.Int,x)); await detalle.query(`INSERT dbo.DespachoPaquetes(despachoId,envioId) SELECT @despachoId,v.id FROM (VALUES ${valores}) v(id)`); await transaccion.commit(); return (await this.listar(identidad)).find(x=>x.despachoId===id)??null;
    } catch(error){await transaccion.rollback();throw error;}
  }
}
