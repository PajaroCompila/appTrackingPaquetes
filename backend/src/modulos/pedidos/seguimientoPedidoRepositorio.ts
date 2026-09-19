import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { ControlOperativoRepositorio } from '../facturadosPendientes/controlOperativoRepositorio.js';
import type {
  CambioPedido,
  PedidoResumen,
  TipoCambioPedido,
} from './pedido.interface.js';

interface CabeceraSeguimiento {
  idOrigen: string;
  fechaEntradaCola: Date;
  excluidoSla: boolean;
  huellaActual: string | null;
  modificadoEn: Date | null;
  modificadoPor: string | null;
}

interface DetalleSeguimiento {
  idOrigen: string;
  identificadorDetalle: string;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
}

interface FilaCambio extends Omit<CambioPedido, 'detectadoEn'> {
  idOrigen: string;
  detectadoEn: Date;
}

interface CambioPendiente {
  pedido: PedidoResumen;
  detalles: DetalleSeguimiento[];
  cambios: Omit<CambioPedido, 'detectadoEn' | 'modificadoPor'>[];
  detectadoEn: Date;
  modificadoPor: string | null;
  huella: string;
}

const texto = (valor: string | null | undefined): string | null => valor?.trim() || null;
const numero = (valor: number | null | undefined): number | null =>
  valor === null || valor === undefined || !Number.isFinite(Number(valor)) ? null : Number(valor);

function fechaHondurasUtc(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const normalizada = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(valor)
    ? `${valor}-06:00` : valor;
  const fecha = new Date(normalizada);
  return Number.isFinite(fecha.getTime()) ? fecha : null;
}

function obtenerFechaEntradaCola(pedido: PedidoResumen): Date {
  if (pedido.origenPedido === 'SAP') {
    return fechaHondurasUtc(pedido.fechaEntradaOrigen) ?? new Date();
  }
  return new Date();
}

function detallesNormalizados(pedido: PedidoResumen): DetalleSeguimiento[] {
  return pedido.articulos.map((articulo, indice) => ({
    idOrigen: pedido.idOrigen,
    identificadorDetalle: texto(articulo.identificadorDetalle) ?? `SIN-PARTIDA-${indice + 1}`,
    codigoArticulo: texto(articulo.codigoArticulo)?.toUpperCase() ?? null,
    descripcion: texto(articulo.descripcion),
    cantidad: numero(articulo.cantidad),
    codigoAlmacen: texto(articulo.codigoAlmacen)?.toUpperCase() ?? null,
  })).sort((a, b) => a.identificadorDetalle.localeCompare(b.identificadorDetalle, 'es', { numeric: true }));
}

function huella(detalles: DetalleSeguimiento[]): string {
  return JSON.stringify(detalles.map(({ identificadorDetalle, codigoArticulo, cantidad, codigoAlmacen }) =>
    [identificadorDetalle, codigoArticulo, cantidad, codigoAlmacen]));
}

export function compararDetalles(
  anteriores: DetalleSeguimiento[],
  actuales: DetalleSeguimiento[],
): Omit<CambioPedido, 'detectadoEn' | 'modificadoPor'>[] {
  const previo = new Map(anteriores.map((linea) => [linea.identificadorDetalle, linea]));
  const nuevo = new Map(actuales.map((linea) => [linea.identificadorDetalle, linea]));
  const cambios: Omit<CambioPedido, 'detectadoEn' | 'modificadoPor'>[] = [];
  for (const [identificador, anterior] of previo) {
    const actual = nuevo.get(identificador);
    if (!actual || anterior.codigoArticulo !== actual.codigoArticulo) {
      cambios.push(crearCambio('ELIMINADO', anterior, null));
      continue;
    }
    if (anterior.cantidad !== actual.cantidad) cambios.push(crearCambio('CANTIDAD', anterior, actual));
    if (anterior.codigoAlmacen !== actual.codigoAlmacen) cambios.push(crearCambio('BODEGA', anterior, actual));
  }
  for (const [identificador, actual] of nuevo) {
    const anterior = previo.get(identificador);
    if (!anterior || anterior.codigoArticulo !== actual.codigoArticulo) {
      cambios.push(crearCambio('AGREGADO', null, actual));
    }
  }
  return cambios;
}

export function identificadoresNuevosSinAsignacion(
  cambios: Omit<CambioPedido, 'detectadoEn' | 'modificadoPor'>[],
): string[] {
  return [...new Set(cambios
    .filter(({ tipo }) => tipo === 'AGREGADO')
    .map(({ identificadorDetalle }) => identificadorDetalle))];
}

function crearCambio(
  tipo: TipoCambioPedido,
  anterior: DetalleSeguimiento | null,
  actual: DetalleSeguimiento | null,
): Omit<CambioPedido, 'detectadoEn' | 'modificadoPor'> {
  return {
    tipo,
    identificadorDetalle: (actual ?? anterior)!.identificadorDetalle,
    codigoArticulo: actual?.codigoArticulo ?? anterior?.codigoArticulo ?? null,
    descripcion: actual?.descripcion ?? anterior?.descripcion ?? null,
    cantidadAnterior: anterior?.cantidad ?? null,
    cantidadNueva: actual?.cantidad ?? null,
    codigoAlmacenAnterior: anterior?.codigoAlmacen ?? null,
    codigoAlmacenNuevo: actual?.codigoAlmacen ?? null,
  };
}

export class SeguimientoPedidoRepositorio {
  public async registrarYAplicar(pedidos: PedidoResumen[], detalleCompleto: boolean): Promise<void> {
    if (pedidos.length === 0) return;
    const estado = await this.cargar(pedidos.map(({ idOrigen }) => idOrigen));
    const nuevos: { pedido: PedidoResumen; detalles: DetalleSeguimiento[]; huella: string | null }[] = [];
    const iniciales: { pedido: PedidoResumen; detalles: DetalleSeguimiento[]; huella: string }[] = [];
    const pendientes: CambioPendiente[] = [];

    for (const pedido of pedidos) {
      const actual = estado.cabeceras.get(pedido.idOrigen);
      const detalles = detallesNormalizados(pedido);
      if (!actual) {
        nuevos.push({ pedido, detalles, huella: detalleCompleto ? huella(detalles) : null });
        continue;
      }
      if (detalleCompleto && actual.huellaActual === null) {
        iniciales.push({ pedido, detalles, huella: huella(detalles) });
      } else if (detalleCompleto) {
        const huellaNueva = huella(detalles);
        if (huellaNueva !== actual.huellaActual) {
          const cambios = compararDetalles(estado.detalles.get(pedido.idOrigen) ?? [], detalles);
          if (cambios.length > 0) {
            pendientes.push({ pedido, detalles, cambios,
              detectadoEn: fechaHondurasUtc(pedido.fechaUltimaModificacion) ?? new Date(),
              modificadoPor: texto(pedido.usuarioUltimaModificacion), huella: huellaNueva });
          }
        }
      }
    }

    if (nuevos.length > 0) await this.guardarNuevos(nuevos, detalleCompleto);
    if (iniciales.length > 0) await this.inicializarDetalles(iniciales);
    if (pendientes.length > 0) await this.guardarCambios(pendientes);

    for (const { pedido } of nuevos) {
      const fechaEntradaCola = obtenerFechaEntradaCola(pedido);
      estado.cabeceras.set(pedido.idOrigen, {
        idOrigen: pedido.idOrigen, fechaEntradaCola, excluidoSla: Boolean(pedido.excluidoSla),
        huellaActual: detalleCompleto ? huella(detallesNormalizados(pedido)) : null,
        modificadoEn: null, modificadoPor: null,
      });
      estado.cambios.set(pedido.idOrigen, []);
    }
    for (const pendiente of pendientes) {
      const cabecera = estado.cabeceras.get(pendiente.pedido.idOrigen)!;
      cabecera.huellaActual = pendiente.huella;
      cabecera.modificadoEn = pendiente.detectadoEn;
      cabecera.modificadoPor = pendiente.modificadoPor;
      estado.cambios.set(pendiente.pedido.idOrigen, [
        ...(estado.cambios.get(pendiente.pedido.idOrigen) ?? []),
        ...pendiente.cambios.map((cambio) => ({ ...cambio,
          detectadoEn: pendiente.detectadoEn.toISOString(), modificadoPor: pendiente.modificadoPor })),
      ]);
    }
    this.aplicarEstado(pedidos, estado);
    // La captura adicional nunca impide mostrar los pedidos existentes.
    try { await new ControlOperativoRepositorio().capturarCabeceras(pedidos); }
    catch { console.error('No fue posible conservar las cabeceras para el control físico local.'); }
  }

  public async aplicar(pedidos: PedidoResumen[]): Promise<void> {
    if (pedidos.length === 0) return;
    this.aplicarEstado(pedidos, await this.cargar(pedidos.map(({ idOrigen }) => idOrigen)));
  }

  public async aplicarArticulos<T extends { idOrigen: string }>(articulos: T[]): Promise<void> {
    if (articulos.length === 0) return;
    const estado = await this.cargar([...new Set(articulos.map(({ idOrigen }) => idOrigen))]);
    for (const articulo of articulos) {
      const cabecera = estado.cabeceras.get(articulo.idOrigen);
      if (!cabecera) continue;
      Object.assign(articulo, {
        fechaEntradaCola: cabecera.fechaEntradaCola.toISOString(),
        excluidoSla: cabecera.excluidoSla,
        modificado: cabecera.modificadoEn !== null,
        modificadoPor: cabecera.modificadoPor,
      });
    }
  }

  private aplicarEstado(
    pedidos: PedidoResumen[],
    estado: Awaited<ReturnType<SeguimientoPedidoRepositorio['cargar']>>,
  ): void {
    for (const pedido of pedidos) {
      const cabecera = estado.cabeceras.get(pedido.idOrigen);
      if (!cabecera) continue;
      pedido.fechaEntradaCola = cabecera.fechaEntradaCola.toISOString();
      pedido.excluidoSla = cabecera.excluidoSla;
      pedido.modificado = cabecera.modificadoEn !== null;
      pedido.modificadoEn = cabecera.modificadoEn?.toISOString() ?? null;
      pedido.modificadoPor = cabecera.modificadoPor;
      pedido.modificaciones = estado.cambios.get(pedido.idOrigen) ?? [];
    }
  }

  private async cargar(ids: string[]): Promise<{
    cabeceras: Map<string, CabeceraSeguimiento>;
    detalles: Map<string, DetalleSeguimiento[]>;
    cambios: Map<string, CambioPedido[]>;
  }> {
    const unicos = [...new Set(ids)];
    const parametros = unicos.map((_, indice) => `@id${indice}`);
    const solicitud = obtenerPoolPedidosBodega().request();
    unicos.forEach((id, indice) => solicitud.input(`id${indice}`, sql.NVarChar(150), id));
    const resultado = await solicitud.query(`SELECT idOrigen, fechaEntradaCola, excluidoSla,
        huellaActual, modificadoEn, modificadoPor
      FROM dbo.SeguimientoPedido WHERE idOrigen IN (${parametros.join(',')});
      SELECT idOrigen, identificadorDetalle, codigoArticulo, descripcion, cantidad, codigoAlmacen
      FROM dbo.SeguimientoPedidoDetalle
      WHERE activo = 1 AND idOrigen IN (${parametros.join(',')});
      SELECT cambio.idOrigen, detalle.tipo, detalle.identificadorDetalle, detalle.codigoArticulo,
        detalle.descripcion, detalle.cantidadAnterior, detalle.cantidadNueva,
        detalle.codigoAlmacenAnterior, detalle.codigoAlmacenNuevo,
        cambio.detectadoEn, cambio.modificadoPor
      FROM dbo.ModificacionPedido cambio
      JOIN dbo.ModificacionPedidoDetalle detalle ON detalle.idModificacion = cambio.idModificacion
      WHERE cambio.idOrigen IN (${parametros.join(',')})
      ORDER BY cambio.detectadoEn, cambio.idModificacion, detalle.idModificacionDetalle;`);
    const conjuntos = resultado.recordsets as unknown as [
      CabeceraSeguimiento[], DetalleSeguimiento[], FilaCambio[],
    ];
    const cabeceras = new Map<string, CabeceraSeguimiento>(
      conjuntos[0].map((fila) => [fila.idOrigen, fila]));
    const detalles = new Map<string, DetalleSeguimiento[]>();
    for (const fila of conjuntos[1]) {
      fila.cantidad = numero(fila.cantidad);
      detalles.set(fila.idOrigen, [...(detalles.get(fila.idOrigen) ?? []), fila]);
    }
    const cambios = new Map<string, CambioPedido[]>();
    for (const fila of conjuntos[2]) {
      cambios.set(fila.idOrigen, [...(cambios.get(fila.idOrigen) ?? []), {
        ...fila, cantidadAnterior: numero(fila.cantidadAnterior), cantidadNueva: numero(fila.cantidadNueva),
        detectadoEn: fila.detectadoEn.toISOString(),
      }]);
    }
    return { cabeceras, detalles, cambios };
  }

  private async guardarNuevos(
    nuevos: { pedido: PedidoResumen; detalles: DetalleSeguimiento[]; huella: string | null }[],
    detalleCompleto: boolean,
  ): Promise<void> {
    const datos = nuevos.map(({ pedido, detalles, huella: valorHuella }) => ({
      idOrigen: pedido.idOrigen, origenPedido: pedido.origenPedido,
      fechaEntradaCola: obtenerFechaEntradaCola(pedido).toISOString(),
      codigoUsuarioOrigen: texto(pedido.codigoUsuarioOrigen), excluidoSla: Boolean(pedido.excluidoSla),
      huella: valorHuella, detalles,
    }));
    await obtenerPoolPedidosBodega().request().input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datos))
      .input('detalleCompleto', sql.Bit, detalleCompleto).query(`
        DECLARE @Nuevos TABLE(idOrigen nvarchar(150) PRIMARY KEY);
        INSERT dbo.SeguimientoPedido(idOrigen, origenPedido, fechaEntradaCola,
          codigoUsuarioOrigen, excluidoSla, huellaActual)
        OUTPUT inserted.idOrigen INTO @Nuevos(idOrigen)
        SELECT entrada.idOrigen, entrada.origenPedido, entrada.fechaEntradaCola,
          entrada.codigoUsuarioOrigen, entrada.excluidoSla, entrada.huella
        FROM OPENJSON(@datos) WITH (
          idOrigen nvarchar(150), origenPedido varchar(3), fechaEntradaCola datetimeoffset(3),
          codigoUsuarioOrigen nvarchar(50), excluidoSla bit, huella nvarchar(max),
          detalles nvarchar(max) AS JSON) entrada
        WHERE NOT EXISTS (SELECT 1 FROM dbo.SeguimientoPedido actual WHERE actual.idOrigen = entrada.idOrigen);

        IF @detalleCompleto = 1
          INSERT dbo.SeguimientoPedidoDetalle(idOrigen, identificadorDetalle, codigoArticulo,
            descripcion, cantidad, codigoAlmacen)
          SELECT entrada.idOrigen, linea.identificadorDetalle, linea.codigoArticulo,
            linea.descripcion, linea.cantidad, linea.codigoAlmacen
          FROM OPENJSON(@datos) WITH (idOrigen nvarchar(150), detalles nvarchar(max) AS JSON) entrada
          JOIN @Nuevos nuevo ON nuevo.idOrigen = entrada.idOrigen
          CROSS APPLY OPENJSON(entrada.detalles) WITH (
            identificadorDetalle nvarchar(150), codigoArticulo nvarchar(100), descripcion nvarchar(500),
            cantidad decimal(19,6), codigoAlmacen nvarchar(16)) linea;`);
  }

  private async inicializarDetalles(
    iniciales: { pedido: PedidoResumen; detalles: DetalleSeguimiento[]; huella: string }[],
  ): Promise<void> {
    const transaccion = new sql.Transaction(obtenerPoolPedidosBodega());
    await transaccion.begin();
    try {
      for (const inicial of iniciales) {
        await new sql.Request(transaccion).input('idOrigen', sql.NVarChar(150), inicial.pedido.idOrigen)
          .input('huella', sql.NVarChar(sql.MAX), inicial.huella)
          .input('detalles', sql.NVarChar(sql.MAX), JSON.stringify(inicial.detalles)).query(`
            UPDATE dbo.SeguimientoPedido SET huellaActual = @huella, actualizadoEn = SYSUTCDATETIME()
              WHERE idOrigen = @idOrigen AND huellaActual IS NULL;
            UPDATE dbo.SeguimientoPedidoDetalle SET activo = 0 WHERE idOrigen = @idOrigen;
            MERGE dbo.SeguimientoPedidoDetalle AS destino
            USING (SELECT @idOrigen AS idOrigen, identificadorDetalle, codigoArticulo, descripcion,
                cantidad, codigoAlmacen
              FROM OPENJSON(@detalles) WITH (identificadorDetalle nvarchar(150),
                codigoArticulo nvarchar(100), descripcion nvarchar(500), cantidad decimal(19,6),
                codigoAlmacen nvarchar(16))) AS fuente
            ON destino.idOrigen = fuente.idOrigen
              AND destino.identificadorDetalle = fuente.identificadorDetalle
            WHEN MATCHED THEN UPDATE SET codigoArticulo = fuente.codigoArticulo,
              descripcion = fuente.descripcion, cantidad = fuente.cantidad,
              codigoAlmacen = fuente.codigoAlmacen, activo = 1
            WHEN NOT MATCHED THEN INSERT(idOrigen, identificadorDetalle, codigoArticulo,
              descripcion, cantidad, codigoAlmacen, activo)
              VALUES(fuente.idOrigen, fuente.identificadorDetalle, fuente.codigoArticulo,
                fuente.descripcion, fuente.cantidad, fuente.codigoAlmacen, 1);`);
      }
      await transaccion.commit();
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
  }

  private async guardarCambios(pendientes: CambioPendiente[]): Promise<void> {
    const transaccion = new sql.Transaction(obtenerPoolPedidosBodega());
    await transaccion.begin();
    try {
      for (const pendiente of pendientes) {
        const idModificacion = (await new sql.Request(transaccion)
          .input('idOrigen', sql.NVarChar(150), pendiente.pedido.idOrigen)
          .input('detectadoEn', sql.DateTimeOffset(3), pendiente.detectadoEn)
          .input('modificadoPor', sql.NVarChar(200), pendiente.modificadoPor)
          .query<{ idModificacion: number }>(`INSERT dbo.ModificacionPedido(idOrigen, detectadoEn, modificadoPor)
            OUTPUT inserted.idModificacion VALUES(@idOrigen, @detectadoEn, @modificadoPor);`))
          .recordset[0]!.idModificacion;
        await new sql.Request(transaccion)
          .input('idModificacion', sql.BigInt, idModificacion)
          .input('cambios', sql.NVarChar(sql.MAX), JSON.stringify(pendiente.cambios))
          .query(`INSERT dbo.ModificacionPedidoDetalle(idModificacion, tipo, identificadorDetalle,
              codigoArticulo, descripcion, cantidadAnterior, cantidadNueva,
              codigoAlmacenAnterior, codigoAlmacenNuevo)
            SELECT @idModificacion, tipo, identificadorDetalle, codigoArticulo, descripcion,
              cantidadAnterior, cantidadNueva, codigoAlmacenAnterior, codigoAlmacenNuevo
            FROM OPENJSON(@cambios) WITH (tipo varchar(12), identificadorDetalle nvarchar(150),
              codigoArticulo nvarchar(100), descripcion nvarchar(500), cantidadAnterior decimal(19,6),
              cantidadNueva decimal(19,6), codigoAlmacenAnterior nvarchar(16), codigoAlmacenNuevo nvarchar(16));`);
        const identificadoresNuevos = identificadoresNuevosSinAsignacion(pendiente.cambios);
        if (identificadoresNuevos.length > 0) {
          await new sql.Request(transaccion)
            .input('idOrigen', sql.NVarChar(150), pendiente.pedido.idOrigen)
            .input('identificadores', sql.NVarChar(sql.MAX), JSON.stringify(identificadoresNuevos))
            .query(`UPDATE asignacion
              SET usuarioAsignado = NULL, nombreAsignado = NULL,
                actualizadoEn = SYSUTCDATETIME()
              FROM dbo.AsignacionArticuloPedido asignacion
              JOIN OPENJSON(@identificadores) identificador
                ON asignacion.identificadorDetalle = identificador.[value]
              WHERE asignacion.idOrigen = @idOrigen;`);
        }
        await new sql.Request(transaccion).input('idOrigen', sql.NVarChar(150), pendiente.pedido.idOrigen)
          .input('huella', sql.NVarChar(sql.MAX), pendiente.huella)
          .input('detectadoEn', sql.DateTimeOffset(3), pendiente.detectadoEn)
          .input('modificadoPor', sql.NVarChar(200), pendiente.modificadoPor)
          .input('detalles', sql.NVarChar(sql.MAX), JSON.stringify(pendiente.detalles)).query(`
            UPDATE dbo.SeguimientoPedido SET huellaActual = @huella, modificadoEn = @detectadoEn,
              modificadoPor = @modificadoPor, actualizadoEn = SYSUTCDATETIME() WHERE idOrigen = @idOrigen;
            UPDATE dbo.SeguimientoPedidoDetalle SET activo = 0 WHERE idOrigen = @idOrigen;
            MERGE dbo.SeguimientoPedidoDetalle AS destino
            USING (SELECT @idOrigen AS idOrigen, identificadorDetalle, codigoArticulo, descripcion,
                cantidad, codigoAlmacen
              FROM OPENJSON(@detalles) WITH (identificadorDetalle nvarchar(150),
                codigoArticulo nvarchar(100), descripcion nvarchar(500), cantidad decimal(19,6),
                codigoAlmacen nvarchar(16))) AS fuente
            ON destino.idOrigen = fuente.idOrigen
              AND destino.identificadorDetalle = fuente.identificadorDetalle
            WHEN MATCHED THEN UPDATE SET codigoArticulo = fuente.codigoArticulo,
              descripcion = fuente.descripcion, cantidad = fuente.cantidad,
              codigoAlmacen = fuente.codigoAlmacen, activo = 1
            WHEN NOT MATCHED THEN INSERT(idOrigen, identificadorDetalle, codigoArticulo,
              descripcion, cantidad, codigoAlmacen, activo)
              VALUES(fuente.idOrigen, fuente.identificadorDetalle, fuente.codigoArticulo,
                fuente.descripcion, fuente.cantidad, fuente.codigoAlmacen, 1);`);
      }
      await transaccion.commit();
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
  }
}
