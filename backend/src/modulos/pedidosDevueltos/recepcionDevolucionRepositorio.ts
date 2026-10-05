import sql from 'mssql';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type { TecnicoAsignable } from '../asignaciones/asignacion.interface.js';
import { MIGRACION_CANCELACIONES_SAP } from './cancelacionSapHistorial.js';

export interface RecepcionDevolucion {
  idOrigen: string;
  estadoOrigen: 'CERRADO' | 'CANCELADO';
  usuarioRecibio: string;
  nombreRecibio: string;
  recibidoEn: string;
}

export class RecepcionDevolucionRepositorio {
  private preparada = false;

  private async preparar(): Promise<void> {
    if (this.preparada) return;
    await obtenerPoolPedidosBodega().request().query(MIGRACION_CANCELACIONES_SAP);
    this.preparada = true;
  }

  public async registrar(
    idOrigen: string,
    tecnico: TecnicoAsignable,
    usuarioId: string,
  ): Promise<RecepcionDevolucion> {
    await this.preparar();
    const transaccion = new sql.Transaction(obtenerPoolPedidosBodega());
    await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const solicitud = new sql.Request(transaccion)
        .input('idOrigen', sql.NVarChar(150), idOrigen)
        .input('usuarioRecibio', sql.NVarChar(100), tecnico.usuario)
        .input('nombreRecibio', sql.NVarChar(200), tecnico.nombre)
        .input('registradoPor', sql.UniqueIdentifier, usuarioId);
      const resultado = await solicitud.query<{
        idOrigen: string; estadoOrigen: 'CERRADO' | 'CANCELADO';
        usuarioRecibio: string; nombreRecibio: string; recibidoEn: Date;
      }>(`
        DECLARE @idPedido bigint;
        SELECT @idPedido=idPedidoDespachado
        FROM dbo.PedidoDespachado WITH(UPDLOCK,HOLDLOCK)
        WHERE idOrigen=@idOrigen AND estadoLocal='CERRADO';
        IF @idPedido IS NULL
          THROW 51001, 'El pedido no está cerrado o cancelado.', 1;
        IF EXISTS(SELECT 1 FROM dbo.RecepcionDevolucionPedido WITH(UPDLOCK,HOLDLOCK)
          WHERE idPedidoDespachado=@idPedido)
          THROW 51002, 'La devolución ya fue recibida.', 1;
        DECLARE @estado varchar(10)=CASE WHEN EXISTS(
          SELECT 1 FROM dbo.CancelacionSapHistorial h
          JOIN dbo.PedidoDespachado p ON p.idPedidoDespachado=@idPedido
          WHERE h.canceled='Y' AND ((p.origenPedido='SAP' AND TRY_CONVERT(int,p.sapDocEntry)=h.docEntry)
            OR (p.origenPedido='R1' AND (p.numeroPedido=h.numeroPedido OR p.folioPedido=h.folioPedido)))
        ) THEN 'CANCELADO' ELSE 'CERRADO' END;
        INSERT dbo.RecepcionDevolucionPedido(idPedidoDespachado,idOrigen,estadoOrigen,
          usuarioRecibio,nombreRecibio,registradoPorUsuarioId)
        OUTPUT inserted.idOrigen,inserted.estadoOrigen,inserted.usuarioRecibio,
          inserted.nombreRecibio,inserted.recibidoEn
        VALUES(@idPedido,@idOrigen,@estado,@usuarioRecibio,@nombreRecibio,@registradoPor);`);
      await transaccion.commit();
      const fila = resultado.recordset[0]!;
      return { ...fila, recibidoEn: fila.recibidoEn.toISOString() };
    } catch (error) {
      await transaccion.rollback();
      const numero = typeof error === 'object' && error !== null && 'number' in error
        ? Number((error as { number: unknown }).number) : 0;
      if (numero === 51001) throw new ErrorAplicacion(409, 'DEVOLUCION_NO_DISPONIBLE',
        'El pedido ya no está disponible para registrar una devolución.');
      if (numero === 51002 || numero === 2627 || numero === 2601) {
        throw new ErrorAplicacion(409, 'DEVOLUCION_YA_RECIBIDA',
          'La devolución ya fue registrada por otro usuario.');
      }
      throw error;
    }
  }
}
