import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { PedidoResumen } from '../pedidos/pedido.interface.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
import { puedeVerAlmacen } from '../usuarios/accesoAlmacenes.js';
import { puedeOperarResponsableDespacho } from '../despachos/despachoServicio.js';
import { resumirControlOperativo, versionLineaFisica } from './controlOperativoModelo.js';
import type { ConfiguracionControlAlmacen, FiltrosControlOperativo, LineaControlOperativo,
  ModoControlAlmacen, PedidoControlOperativo, SeleccionConfirmacionFisica } from './controlOperativo.interface.js';

interface FilaControl {
  idOrigen: string; cabecera: string; identificadorDetalle: string; codigoArticulo: string | null;
  descripcion: string | null; cantidad: number | null; codigoAlmacen: string | null;
  modoControl: ModoControlAlmacen | null; cantidadDespachada: number;
  usuarioAsignado: string | null; nombreAsignado: string | null; responsableConfigurado: string | null;
  versionesConfirmadas: string | null;
}
export interface EstadoFinancieroControl {
  idOrigen: string; facturado: boolean | null; fuente: string | null;
  cabecera?: { numeroPedido: string; nombreVendedor: string | null; fechaHoraPedido: string | null };
}

export class ControlOperativoRepositorio {
  public async disponible(): Promise<boolean> {
    const r = await obtenerPoolPedidosBodega().request().query<{ disponible: boolean }>(`
      SELECT CONVERT(bit,CASE WHEN OBJECT_ID(N'dbo.ControlOperativoPedido',N'U') IS NOT NULL
        AND OBJECT_ID(N'dbo.ConfiguracionControlAlmacen',N'U') IS NOT NULL
        AND OBJECT_ID(N'dbo.ConfirmacionFisicaPedido',N'U') IS NOT NULL THEN 1 ELSE 0 END) disponible;`);
    return Boolean(r.recordset[0]?.disponible);
  }

  // Se adjunta solamente la cabecera; las líneas siguen en SeguimientoPedidoDetalle.
  public async capturarCabeceras(pedidos: PedidoResumen[]): Promise<void> {
    if (!pedidos.length) return;
    const datos = pedidos.map(p => ({ idOrigen: p.idOrigen, cabecera: JSON.stringify({
      numeroPedido: p.numeroPedido, folioPedido: p.folioPedido, nombreVendedor: p.nombreVendedor,
      fechaHoraPedido: p.fechaHoraPedido, origenPedido: p.origenPedido, sapDocEntry: p.sapDocEntry,
    }) }));
    await obtenerPoolPedidosBodega().request().input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datos))
      .query(`IF DB_NAME()<>N'PedidosBodega' THROW 51000,'Base no autorizada.',1;
      IF OBJECT_ID(N'dbo.ControlOperativoPedido',N'U') IS NOT NULL
      BEGIN
        DECLARE @entrada TABLE(idOrigen nvarchar(150) PRIMARY KEY,cabecera nvarchar(max));
        INSERT @entrada SELECT idOrigen,cabecera FROM OPENJSON(@datos)
          WITH(idOrigen nvarchar(150),cabecera nvarchar(max));
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;
        UPDATE p WITH(UPDLOCK,HOLDLOCK) SET cabecera=e.cabecera,actualizadoEn=SYSUTCDATETIME()
          FROM dbo.ControlOperativoPedido p JOIN @entrada e ON e.idOrigen=p.idOrigen
          WHERE p.cabecera<>e.cabecera AND p.estadoFinanciero IS NULL;
        INSERT dbo.ControlOperativoPedido(idOrigen,cabecera)
          SELECT e.* FROM @entrada e JOIN dbo.SeguimientoPedido s ON s.idOrigen=e.idOrigen
          WHERE NOT EXISTS(SELECT 1 FROM dbo.ControlOperativoPedido p WITH(UPDLOCK,HOLDLOCK)
            WHERE p.idOrigen=e.idOrigen);
        COMMIT;
      END;`);
  }

  public async candidatosFinancieros(): Promise<{ idOrigen: string }[]> {
    const r = await obtenerPoolPedidosBodega().request().query<{ idOrigen: string }>(`
      SELECT TOP(5000) p.idOrigen FROM dbo.ControlOperativoPedido p
      JOIN dbo.SeguimientoPedido s ON s.idOrigen=p.idOrigen
      WHERE s.huellaActual IS NOT NULL
      ORDER BY p.revisadoFinancieroEn,p.idOrigen;`);
    return r.recordset;
  }

  public async guardarEstados(estados: EstadoFinancieroControl[]): Promise<void> {
    if (!estados.length) return;
    await obtenerPoolPedidosBodega().request().input('datos',sql.NVarChar(sql.MAX),JSON.stringify(estados))
      .query(`IF DB_NAME()<>N'PedidosBodega' THROW 51000,'Base no autorizada.',1;
        UPDATE p SET estadoFinanciero=CASE WHEN e.facturado IS NULL THEN p.estadoFinanciero
            WHEN e.facturado=1 THEN N'Facturado' ELSE NULL END,
          fuenteFinanciera=COALESCE(e.fuente,p.fuenteFinanciera),revisadoFinancieroEn=SYSUTCDATETIME(),
          cabecera=CASE WHEN e.cabecera IS NOT NULL THEN e.cabecera ELSE p.cabecera END
        FROM dbo.ControlOperativoPedido p JOIN OPENJSON(@datos) WITH(
          idOrigen nvarchar(150),facturado bit,fuente nvarchar(80),cabecera nvarchar(max) AS JSON) e
          ON e.idOrigen=p.idOrigen;`);
  }

  private async leer(f?: FiltrosControlOperativo, ids?: string[], tx?: sql.Transaction): Promise<FilaControl[]> {
    const r = (tx ? new sql.Request(tx) : obtenerPoolPedidosBodega().request())
      .input('ids',sql.NVarChar(sql.MAX),ids ? JSON.stringify(ids) : null)
      .input('numero',sql.NVarChar(100),f?.numeroPedido || null)
      .input('desde',sql.Date,f?.fechaDesde ?? null).input('hasta',sql.Date,f?.fechaHasta ?? null)
      .input('almacenes',sql.NVarChar(sql.MAX),JSON.stringify(f?.codigosAlmacen ?? []));
    const resultado = await r.query<FilaControl>(`
      SELECT p.idOrigen,p.cabecera,l.identificadorDetalle,l.codigoArticulo,l.descripcion,
        l.cantidad,l.codigoAlmacen,c.modoControl,a.usuarioAsignado,
        a.nombreAsignado,
        CASE WHEN responsables.cantidad=1 THEN responsables.nombre ELSE NULL END responsableConfigurado,
        ISNULL(d.cantidad,0) cantidadDespachada,
        (SELECT STRING_AGG(CONVERT(varchar(max),confirmacion.version),',')
          FROM dbo.ConfirmacionFisicaPedido confirmacion WHERE confirmacion.idOrigen=l.idOrigen
            AND confirmacion.identificadorDetalle=l.identificadorDetalle) versionesConfirmadas
      FROM dbo.ControlOperativoPedido p ${tx ? 'WITH(UPDLOCK,HOLDLOCK)' : ''}
      JOIN dbo.SeguimientoPedido s ON s.idOrigen=p.idOrigen AND s.huellaActual IS NOT NULL
      JOIN dbo.SeguimientoPedidoDetalle l ON l.idOrigen=p.idOrigen AND l.activo=1
      LEFT JOIN dbo.ConfiguracionControlAlmacen c ON c.codigoAlmacen=l.codigoAlmacen AND c.activo=1
      LEFT JOIN dbo.AsignacionArticuloPedido a ON a.idOrigen=l.idOrigen
        AND a.identificadorDetalle=l.identificadorDetalle
      OUTER APPLY(SELECT COUNT(*) cantidad,MAX(u.nombreVisible) nombre
        FROM dbo.UsuarioAplicacion u WHERE u.codigoAlmacen=l.codigoAlmacen
          AND u.activo=1 AND u.codigoRol='OPERADOR_BODEGA') responsables
      OUTER APPLY(SELECT SUM(detalle.cantidad) cantidad FROM dbo.PedidoDespachadoDetalle detalle
        WHERE detalle.idOrigen=l.idOrigen AND detalle.identificadorDetalle=l.identificadorDetalle
          AND detalle.codigoArticulo=l.codigoArticulo AND detalle.codigoAlmacen=l.codigoAlmacen) d
      WHERE p.estadoFinanciero=N'Facturado'
        AND (@ids IS NULL OR p.idOrigen IN(SELECT value FROM OPENJSON(@ids)))
        AND (@numero IS NULL OR JSON_VALUE(p.cabecera,'$.numeroPedido') LIKE '%'+@numero+'%')
        AND (@desde IS NULL OR TRY_CONVERT(date,JSON_VALUE(p.cabecera,'$.fechaHoraPedido'))>=@desde)
        AND (@hasta IS NULL OR TRY_CONVERT(date,JSON_VALUE(p.cabecera,'$.fechaHoraPedido'))<=@hasta)
        AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@almacenes))
          OR l.codigoAlmacen IN(SELECT value FROM OPENJSON(@almacenes)))
      ORDER BY p.idOrigen,TRY_CONVERT(bigint,l.identificadorDetalle),l.identificadorDetalle;`);
    return resultado.recordset;
  }

  private proyectar(filas: FilaControl[]): PedidoControlOperativo[] {
    const grupos = new Map<string,{ cabecera: PedidoControlOperativo; lineas: LineaControlOperativo[] }>();
    for (const f of filas) {
      // Las identidades sintéticas o sin partida no sirven para confirmar una obligación.
      if (!/^\d{1,20}$/.test(f.identificadorDetalle) || !(Number(f.cantidad)>0) || !f.codigoArticulo) continue;
      const base = { idOrigen:f.idOrigen,identificadorDetalle:f.identificadorDetalle,
        codigoArticulo:f.codigoArticulo,codigoAlmacen:f.codigoAlmacen,cantidad:Number(f.cantidad) };
      const version=versionLineaFisica(base);
      const confirmado=f.modoControl==='MANUAL' && (Number(f.cantidadDespachada)>=base.cantidad
        || (f.versionesConfirmadas?.split(',') ?? []).includes(version));
      const linea: LineaControlOperativo = { ...base,version,descripcion:f.descripcion,
        cantidad:confirmado ? base.cantidad : Math.max(0,base.cantidad-Number(f.cantidadDespachada)),
        modoControl:f.modoControl,confirmado,usuarioAsignado:f.usuarioAsignado,
        responsable:f.nombreAsignado ?? f.responsableConfigurado,
        estadoOperativo:f.modoControl==='SIN_VALIDACION_MANUAL' ? 'Sin validación manual'
          : f.modoControl==='MANUAL' ? confirmado ? 'Confirmado' : 'Pendiente de entrega' : 'Sin configuración',
      };
      if (!grupos.has(f.idOrigen)) grupos.set(f.idOrigen,{cabecera:{...JSON.parse(f.cabecera),idOrigen:f.idOrigen},lineas:[]});
      grupos.get(f.idOrigen)!.lineas.push(linea);
    }
    return [...grupos.values()].flatMap(g => {
      const pedido=resumirControlOperativo(g.cabecera,g.lineas);return pedido ? [pedido] : [];
    });
  }

  public async listar(f: FiltrosControlOperativo): Promise<{ datos: PedidoControlOperativo[]; total: number }> {
    const pedidos=this.proyectar(await this.leer(f));
    const inicio=(f.pagina-1)*f.cantidadPorPagina;
    if (f.vista==='pedido') return {datos:pedidos.slice(inicio,inicio+f.cantidadPorPagina),total:pedidos.length};
    const articulos=pedidos.flatMap(p => p.lineas.map(l => ({...p,lineas:[l]})));
    return {datos:articulos.slice(inicio,inicio+f.cantidadPorPagina),total:articulos.length};
  }

  public async obtener(id: string, codigosAlmacen: string[]): Promise<PedidoControlOperativo | null> {
    return this.proyectar(await this.leer({codigosAlmacen,pagina:1,cantidadPorPagina:100,vista:'pedido'},[id]))[0] ?? null;
  }

  public async configuraciones(): Promise<ConfiguracionControlAlmacen[]> {
    const r=await obtenerPoolPedidosBodega().request().query<ConfiguracionControlAlmacen>(`
      WITH Codigos AS(SELECT codigoAlmacen FROM dbo.SeguimientoPedidoDetalle WHERE codigoAlmacen IS NOT NULL
        UNION SELECT codigoAlmacen FROM dbo.ConfiguracionControlAlmacen)
      SELECT k.codigoAlmacen,c.modoControl,ISNULL(c.requiereConfirmacionFisica,0) requiereConfirmacionFisica,
        ISNULL(c.activo,0) activo,
        CASE WHEN COUNT(u.idUsuario)=1 THEN MAX(u.nombreVisible) ELSE NULL END responsableConfigurado
      FROM Codigos k LEFT JOIN dbo.ConfiguracionControlAlmacen c ON c.codigoAlmacen=k.codigoAlmacen
      LEFT JOIN dbo.UsuarioAplicacion u ON u.codigoAlmacen=k.codigoAlmacen AND u.activo=1
        AND u.codigoRol='OPERADOR_BODEGA'
      GROUP BY k.codigoAlmacen,c.modoControl,c.requiereConfirmacionFisica,c.activo ORDER BY k.codigoAlmacen;`);
    return r.recordset;
  }

  public async configurar(codigo: string, modo: ModoControlAlmacen, activo: boolean): Promise<void> {
    await obtenerPoolPedidosBodega().request().input('codigo',sql.NVarChar(16),codigo)
      .input('modo',sql.VarChar(30),modo).input('activo',sql.Bit,activo)
      .query(`IF DB_NAME()<>N'PedidosBodega' THROW 51000,'Base no autorizada.',1;
        SET XACT_ABORT ON; BEGIN TRANSACTION;
        UPDATE dbo.ConfiguracionControlAlmacen WITH(UPDLOCK,HOLDLOCK)
          SET modoControl=@modo,requiereConfirmacionFisica=CASE WHEN @modo='MANUAL' THEN 1 ELSE 0 END,
            activo=@activo,actualizadoEn=SYSUTCDATETIME() WHERE codigoAlmacen=@codigo;
        IF @@ROWCOUNT=0 INSERT dbo.ConfiguracionControlAlmacen(codigoAlmacen,modoControl,requiereConfirmacionFisica,activo)
          VALUES(@codigo,@modo,CASE WHEN @modo='MANUAL' THEN 1 ELSE 0 END,@activo);
        COMMIT;`);
  }

  public async confirmar(lineas: SeleccionConfirmacionFisica[], usuario: IdentidadAutenticada): Promise<void> {
    if (!['ADMINISTRADOR','OPERADOR_BODEGA'].includes(usuario.codigoRol ?? '')) {
      throw new ErrorAplicacion(403,'ROL_NO_AUTORIZADO','No tiene permiso para confirmar entregas.');
    }
    const tx=new sql.Transaction(obtenerPoolPedidosBodega());
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const vigentes=this.proyectar(await this.leer(undefined,[...new Set(lineas.map(l=>l.idOrigen))],tx))
        .flatMap(p=>p.lineas);
      for (const seleccion of lineas) {
        const linea=vigentes.find(l=>l.idOrigen===seleccion.idOrigen && l.identificadorDetalle===seleccion.identificadorDetalle);
        if (!linea || linea.version!==seleccion.version) throw new ErrorAplicacion(409,'ENTREGA_CAMBIO',
          'La partida cambió o ya fue confirmada. Actualizá el pedido.');
        if (!puedeVerAlmacen(usuario,linea.codigoAlmacen) || (linea.usuarioAsignado
          && !puedeOperarResponsableDespacho(usuario,linea.usuarioAsignado))) throw new ErrorAplicacion(403,
            'RESPONSABLE_NO_AUTORIZADO','No tiene permiso para confirmar esta partida.');
        await new sql.Request(tx).input('id',sql.NVarChar(150),linea.idOrigen)
          .input('detalle',sql.NVarChar(150),linea.identificadorDetalle).input('version',sql.Char(64),linea.version)
          .input('usuario',sql.UniqueIdentifier,usuario.usuarioId).query(`
            IF DB_NAME()<>N'PedidosBodega' THROW 51000,'Base no autorizada.',1;
            INSERT dbo.ConfirmacionFisicaPedido(idOrigen,identificadorDetalle,version,idUsuario)
              VALUES(@id,@detalle,@version,@usuario);`);
      }
      await tx.commit();
    } catch(e) {await tx.rollback();throw e;}
  }
}
