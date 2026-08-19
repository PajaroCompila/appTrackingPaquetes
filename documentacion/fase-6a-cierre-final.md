# Fase 6A — Cierre documental final

Fecha: 30 de julio de 2026  
Estado: `GO condicionado por excepción temporal de seguridad`  
Destino: validación controlada; no apta para producción  
Fase 6B: `NO-GO`

## 1. Resumen ejecutivo

La Fase 6A quedó implementada y aceptada para validación controlada. SistemaOrigen conserva el estado oficial de validación y recibió exclusivamente consultas `SELECT`. La base `PedidosBodega`, en `192.168.10.150`, es el único destino de las escrituras propias de usuarios, historial y auditoría.

Por excepción temporal autorizada, los dos pools usan `sa` mediante bloques de variables independientes en `backend/.env`. SQL Server no garantiza solo lectura para una cuenta `sysadmin`; la protección de SistemaOrigen depende actualmente de la barrera implementada en el código. Esta excepción debe eliminarse antes de producción.

La identidad `pedidos_bodega_app` permanece creada y sin utilizar. No se creó ningún objeto propio en `master`.

## 2. Valores reales de `U_SO1_VERIFICADO`

Se ejecutó una única consulta agregada, parametrizada con `@limite = 20`, sin folios ni información comercial.

| Valor normalizado | Cantidad |
|---|---:|
| `N` | 443,781 |
| `Y` | 84,438 |
| `NULL` | No apareció en el resultado agregado |
| Vacío | No apareció en el resultado agregado |
| Otros | No aparecieron en el resultado agregado |

Consulta utilizada:

```sql
SELECT TOP (@limite)
  CASE
    WHEN venta.[U_SO1_VERIFICADO] IS NULL THEN N'<NULL>'
    WHEN LTRIM(RTRIM(venta.[U_SO1_VERIFICADO])) = N'' THEN N'<VACÍO>'
    ELSE LTRIM(RTRIM(venta.[U_SO1_VERIFICADO]))
  END AS valor,
  COUNT_BIG(*) AS cantidad
FROM [dbo].[@SO1_01VENTA] AS venta
GROUP BY
  CASE
    WHEN venta.[U_SO1_VERIFICADO] IS NULL THEN N'<NULL>'
    WHEN LTRIM(RTRIM(venta.[U_SO1_VERIFICADO])) = N'' THEN N'<VACÍO>'
    ELSE LTRIM(RTRIM(venta.[U_SO1_VERIFICADO]))
  END
ORDER BY cantidad DESC, valor;
```

La ausencia de grupos `NULL`, vacío u otros describe la consulta realizada el 30 de julio de 2026; no constituye una restricción empresarial permanente.

## 3. Consulta final de la cola activa

Todos los filtros son parámetros del driver `mssql`. La consulta se ejecuta mediante la barrera central de SistemaOrigen.

```sql
SELECT
  venta.[Name] AS folioPedido,
  venta.[Code] AS codigoVenta,
  CONVERT(char(10), venta.[U_SO1_FECHA], 23) AS fechaPedido,
  venta.[U_SO1_STATUS] AS codigoEstadoVenta,
  venta.[U_SO1_SINCRONIZADO] AS codigoSincronizacion
FROM [dbo].[@SO1_01VENTA] AS venta
WHERE ISNULL(venta.[U_SO1_VERIFICADO], 'N') <> 'Y'
  AND (@folioPedido IS NULL OR venta.[Name] = @folioPedido)
  AND (@fechaDesde IS NULL OR venta.[U_SO1_FECHA] >= @fechaDesde)
  AND (@fechaHasta IS NULL OR venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta))
  AND (@codigoEstadoVenta IS NULL OR venta.[U_SO1_STATUS] = @codigoEstadoVenta)
  AND (@codigoSincronizacion IS NULL OR venta.[U_SO1_SINCRONIZADO] = @codigoSincronizacion)
  AND (
    @codigoAlmacen IS NULL
    OR EXISTS (
      SELECT 1
      FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
      WHERE detalle.[U_SO1_FOLIO] = venta.[Name]
        AND detalle.[U_SO1_ALMACEN] = @codigoAlmacen
    )
  )
ORDER BY venta.[U_SO1_FECHA] DESC, venta.[Name] DESC
OFFSET @desplazamiento ROWS
FETCH NEXT @cantidadConsulta ROWS ONLY;
```

Parámetros: `@folioPedido`, `@fechaDesde`, `@fechaHasta`, `@codigoEstadoVenta`, `@codigoSincronizacion`, `@codigoAlmacen`, `@desplazamiento` y `@cantidadConsulta`.

## 4. Consulta fuente para sincronizar el historial

SistemaOrigen recibe únicamente este `SELECT` para localizar pedidos validados:

```sql
SELECT TOP (@limite)
  venta.[Name] AS folioPedido,
  CONVERT(char(10), venta.[U_SO1_FECHA], 23) AS fechaPedido,
  NULLIF(LTRIM(RTRIM(venta.[U_SO1_SUCURSAL])), '') AS codigoSucursal,
  LTRIM(RTRIM(detalle.[U_SO1_ALMACEN])) AS codigoAlmacen,
  NULLIF(LTRIM(RTRIM(venta.[U_SO1_STATUS])), '') AS codigoEstadoVenta
FROM [dbo].[@SO1_01VENTA] AS venta
INNER JOIN [dbo].[@SO1_01VENTADETALLE] AS detalle
  ON detalle.[U_SO1_FOLIO] = venta.[Name]
WHERE venta.[U_SO1_VERIFICADO] = 'Y'
  AND venta.[U_SO1_FECHA] >= @fechaDesde
  AND NULLIF(LTRIM(RTRIM(detalle.[U_SO1_ALMACEN])), '') IS NOT NULL
GROUP BY venta.[Name], venta.[U_SO1_FECHA], venta.[U_SO1_SUCURSAL],
         detalle.[U_SO1_ALMACEN], venta.[U_SO1_STATUS]
ORDER BY venta.[U_SO1_FECHA] DESC, venta.[Name] DESC,
         detalle.[U_SO1_ALMACEN];
```

Parámetros actuales: `@limite = 1000` y `@fechaDesde`, calculado como 30 días antes de la ejecución.

## 5. Consulta final del historial local

Esta consulta se ejecuta exclusivamente en `PedidosBodega`:

```sql
SELECT
  folioPedido,
  CONVERT(char(10), fechaPedido, 23) AS fechaPedido,
  codigoSucursal,
  codigoAlmacen,
  codigoEstadoVenta,
  observadoValidadoEn,
  ultimaObservacionEn
FROM dbo.HistorialPedidoValidado
WHERE observadoValidadoEn >= @fechaDesde
  AND observadoValidadoEn < DATEADD(day, 1, @fechaHasta)
  AND (@codigoSucursal IS NULL OR codigoSucursal = @codigoSucursal)
  AND (@codigoAlmacen IS NULL OR codigoAlmacen = @codigoAlmacen)
ORDER BY observadoValidadoEn DESC, folioPedido DESC, codigoAlmacen
OFFSET @desplazamiento ROWS
FETCH NEXT @cantidadConsulta ROWS ONLY;
```

El rango admitido por la API es de hasta 31 días y la página está limitada a 100 registros.

## 6. Alcance y riesgo de la sincronización

Alcance actual por ciclo:

- Pedidos cuya fecha sea de los últimos 30 días.
- Máximo 1,000 combinaciones distintas de pedido y almacén.
- Ejecución al iniciar el backend y luego cada cinco minutos.
- Identidad local idempotente: `folioPedido + codigoAlmacen`.
- La fecha `observadoValidadoEn` representa cuándo Pedidos Bodega observó el estado, no el momento exacto en que SistemaOrigen validó el pedido.

### Riesgo conocido

Si existen más de 1,000 combinaciones elegibles dentro de la ventana, las adicionales quedan pendientes. Como la consulta siempre ordena desde los registros más recientes, un conjunto superior al límite puede impedir que combinaciones posteriores entren en ciclos siguientes.

También pueden quedar fuera pedidos antiguos que sean marcados como validados después de superar la ventana de 30 días, porque SistemaOrigen no proporciona una fecha de validación confirmada en este contrato.

Antes de producción debe diseñarse y probarse un mecanismo de paginación o backfill con cursor estable, límites operativos y conciliación, sin aumentar carga sobre SistemaOrigen arbitrariamente.

## 7. Separación de operaciones por base

### 7.1 Cero escrituras en SistemaOrigen

Durante la ejecución real se realizaron solamente:

1. `SELECT TOP (@limite)` de pedidos validados y sus almacenes.
2. `SELECT` parametrizado para verificar que un pedido validado no aparecía en la cola activa.
3. La consulta agregada de `U_SO1_VERIFICADO` documentada en este cierre.

La barrera de código exige una única sentencia que comience con `SELECT`; rechaza comentarios, múltiples sentencias, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `SELECT INTO`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `EXEC`, `EXECUTE`, `OPENROWSET` y `OPENDATASOURCE`.

No se ejecutaron escrituras, procedimientos, migraciones ni cambios de permisos en SistemaOrigen.

### 7.2 Escrituras autorizadas en `PedidosBodega`

La sincronización real ejecutó:

1. `INSERT` en `dbo.SincronizacionHistorial` para registrar el inicio.
2. `UPDATE` de `dbo.HistorialPedidoValidado` por `folioPedido + codigoAlmacen`.
3. `INSERT` en `dbo.HistorialPedidoValidado` cuando no existía la clave idempotente.
4. `UPDATE` de `dbo.SincronizacionHistorial` con resultado y cantidad observada.
5. `INSERT` en `dbo.EventoAplicacion` para la auditoría de sincronización.

Se procesaron 1,000 observaciones. Este número no implica necesariamente 1,000 filas nuevas: cada observación pudo insertar o actualizar la clave idempotente correspondiente.

No se ejecutó eliminación física de historial. No se crearon usuarios funcionales durante la sincronización.

### 7.3 Consulta de metadatos en `master`

`master` recibió únicamente un `SELECT` sobre `sys.objects` para confirmar la ausencia de objetos propios. Resultado: cero objetos de Pedidos Bodega.

No se crearon tablas, vistas, procedimientos, usuarios funcionales, historial ni auditoría en `master`.

## 8. Resultados funcionales comprobados

- Sincronización real completada con 1,000 observaciones.
- `GET /api/historial-validados` respondió HTTP 200.
- El historial local contenía registros.
- Un pedido validado seleccionado internamente no apareció en la cola activa.
- El folio utilizado para la comprobación no se incluyó en el informe.
- Se registró la ejecución de sincronización.
- Se registró un evento auditable de sincronización.
- Los objetos propios en `master` permanecieron en cero.
- El servidor fue cerrado al terminar la validación.

## 9. Archivos modificados durante la Fase 6A

Debido a que el repositorio completo aparece como no rastreado, Git no permite reconstruir un diff histórico confiable. Esta lista se deriva del registro de cambios realizado durante la implementación.

### Raíz

- `README.md`

### Configuración y aprovisionamiento del backend

- `backend/.env` — local, ignorado y con secretos no mostrados.
- `backend/.env.example`
- `backend/package.json`
- `backend/scripts/aprovisionarBaseDatos.ts`
- `backend/src/configuracion/configuracionBaseDatos.ts`
- `backend/src/infraestructura/sql/crearPoolSql.ts`
- `backend/src/infraestructura/sql/crearPoolSistemaOrigen.ts`
- `backend/src/infraestructura/sql/conexionSistemaOrigen.ts`
- `backend/src/infraestructura/sql/conexionPedidosBodega.ts`
- `backend/src/infraestructura/sql/consultaSistemaOrigen.ts`
- `backend/src/servidor.ts`
- `backend/src/aplicacion.ts`

### Módulos del backend

- `backend/src/modulos/almacenes/almacenRepositorio.ts`
- `backend/src/modulos/pedidos/pedidoRepositorio.ts`
- `backend/src/modulos/historial/historial.interface.ts`
- `backend/src/modulos/historial/historialValidacion.ts`
- `backend/src/modulos/historial/historialRepositorio.ts`
- `backend/src/modulos/historial/historialServicio.ts`
- `backend/src/modulos/historial/historialRutas.ts`
- `backend/src/modulos/historial/sincronizadorHistorial.ts`

### Pruebas del backend

- `backend/pruebas/configuracionBaseDatos.test.ts`
- `backend/pruebas/consultaSistemaOrigen.test.ts`
- `backend/pruebas/historialValidacion.test.ts`
- `backend/pruebas/historialRepositorio.test.ts`
- `backend/pruebas/pedidoRepositorio.test.ts`

### Frontend

- `frontend/src/app/app.html`
- `frontend/src/app/app.css`
- `frontend/src/app/app.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/app.spec.ts`
- `frontend/src/app/compartido/manejar-error-http.ts`
- `frontend/src/app/funcionalidades/historial/historial.interface.ts`
- `frontend/src/app/funcionalidades/historial/historial.service.ts`
- `frontend/src/app/funcionalidades/historial/historial.component.ts`
- `frontend/src/app/funcionalidades/historial/historial.component.html`
- `frontend/src/app/funcionalidades/historial/historial.component.css`

### Salidas generadas

- `backend/dist/` fue regenerado por TypeScript y permanece ignorado.
- `frontend/dist/` fue regenerado por Angular y permanece ignorado.

No se modificaron los informes de Fase 5B o 5C durante la implementación de Fase 6A.

## 10. Manifiestos SHA-256

### Manifiesto específico previo a la implementación de Fase 6A

No fue generado. Por tanto, no existe una comparación SHA-256 que pueda demostrar retrospectivamente todos los cambios de la implementación 6A. El estado `??` de Git tampoco demuestra integridad de contenido.

### Antecedente disponible

Durante el cierre de Fase 5C se compararon manifiestos de 93 archivos y resultaron idénticos. Esa comparación corresponde exclusivamente a Fase 5C y no se presenta como evidencia de Fase 6A.

### Manifiestos del cierre documental actual

Se generó un manifiesto previo a este documento con 114 archivos del proyecto, excluyendo `.git`, dependencias, cachés, salidas de compilación y este nuevo entregable. Al finalizar se generó el manifiesto posterior con las mismas reglas.

Resultado esperado y posteriormente verificado:

```text
Archivos previos: 114
Archivos posteriores: 114
Comparación SHA-256: idéntica
Único archivo excluido y autorizado: documentacion/fase-6a-cierre-final.md
```

Los manifiestos temporales se almacenaron fuera del repositorio.

## 11. Comandos de validación y resultados

### Aprovisionamiento

```powershell
cd backend
npm.cmd run db:provision
```

Resultado: base, tablas, migración e identidad `pedidos_bodega_app` creadas; credenciales no expuestas.

### Backend

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd audit --omit=dev
```

Resultados:

```text
Compilación TypeScript: correcta
Lint: correcto
Pruebas: 10 archivos, 27 pruebas aprobadas
Auditoría de producción: 0 vulnerabilidades
```

### Frontend

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test -- --watch=false
npm.cmd audit --omit=dev
npm.cmd audit
```

Resultados:

```text
Compilación Angular: correcta
Lint: correcto
Pruebas: 5 archivos, 13 pruebas aprobadas
Auditoría de producción: 0 vulnerabilidades
Auditoría completa: 3 vulnerabilidades moderadas de desarrollo
```

Las tres vulnerabilidades moderadas provienen de la cadena de herramientas de Angular: `@angular/cli` depende de `@modelcontextprotocol/sdk`, que depende de una versión afectada de `@hono/node-server`. El aviso corresponde a traversal de ruta en `serve-static` para Windows mediante barra invertida codificada. La corrección automática ofrecida requiere `npm audit fix --force` y propone un cambio mayor; no fue aplicada.

### Ejecución real

```powershell
npm.cmd start
```

Resultado: API disponible en el puerto 3280 y sincronización real completada. El proceso fue detenido al finalizar. Las señales del PTY no fueron entregadas al proceso hijo, por lo que se detuvo únicamente el PID identificado del backend.

## 12. Seguridad temporal y recomendación

Se acepta temporalmente:

- `sa` para SistemaOrigen.
- `sa` para `PedidosBodega`.
- Mismo nombre de usuario en ambos pools.
- Variables y conexiones completamente separadas.

Riesgos:

- `readOnlyIntent` no limita a `sa`.
- La barrera de código puede ser omitida por código futuro que acceda directamente al pool si no se mantiene revisión estricta.
- Una vulnerabilidad de ejecución de SQL tendría impacto administrativo.
- No existe separación de responsabilidades a nivel del motor.

Antes de producción es obligatorio:

1. Reemplazar `sa` en SistemaOrigen por una identidad limitada a `SELECT` sobre objetos autorizados.
2. Volver a utilizar `pedidos_bodega_app` o una identidad equivalente de mínimo privilegio en la base propia.
3. Impedir que el backend normal cargue credenciales administrativas.
4. Validar permisos efectivos mediante metadatos.
5. Repetir compilación, pruebas, auditoría y validación funcional.

## 13. Decisión final

- Fase 6A: `GO condicionado por excepción temporal de seguridad`.
- Uso permitido: validación controlada.
- Producción: `NO-GO` mientras se utilice `sa`.
- Fase 6B: `NO-GO`.
- No se autoriza ninguna operación de entrega ni escritura en SistemaOrigen.
