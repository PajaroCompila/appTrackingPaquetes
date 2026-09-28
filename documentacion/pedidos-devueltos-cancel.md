# Historial de pedidos cancelados

Pedidos devueltos conserva pedidos SAP cuya cabecera `ORDR.CANCELED` es exactamente `Y`. La pantalla los identifica como **CANCEL**. `DocStatus=C` por sí solo no es una cancelación; los documentos abiertos, cerrados sin cancelar y documentos auxiliares con `CANCELED=C` quedan excluidos.

Las lecturas de SAP no modifican documentos. El historial se guarda en `PedidosBodega.dbo.CancelacionSapHistorial`, con identidad única por DocEntry y una copia de la cabecera y las líneas RDR1. No depende de un despacho previamente registrado en la aplicación. Las importaciones son idempotentes y no eliminan las cancelaciones ya observadas, aunque SAP deje de estar disponible.

La fecha mostrada y utilizada en los filtros es la **fecha del pedido** (`DocDate` y `DocTime`, hora de Honduras). No se presenta `UpdateDate` como fecha de cancelación. CANCEL tampoco confirma que la mercadería haya sido recibida físicamente. El módulo anterior de recepción física conserva sus tablas, pero no alimenta esta pantalla.

La sincronización forma parte del ciclo de historial y se intenta también al consultar el módulo, con un intervalo mínimo de 60 segundos. La pantalla actualiza cada minuto y al recuperar el foco. Al abrirla no se heredan filtros de fecha o bodega de otras pantallas; se mantienen las restricciones de bodegas autorizadas de cada usuario. Las vistas Pedido y Artículos tienen filtros, paginación y detalle compartido con Historial.

## Operación y verificación

Desde `backend`:

```powershell
npm run db:sync:cancelaciones
npx tsx scripts/validarCancelacionesSap.ts
```

La primera ejecución prepara únicamente la tabla local y carga las cancelaciones históricas. La cuenta de base de datos necesita permisos para crear la tabla durante esta preparación.

Verificado el 28 de septiembre de 2026: 510 cancelaciones en SAP y 510 en el historial, sin duplicados. Los pedidos `101471323` (2 de septiembre), `700059230` y `700059235` (10 de septiembre) aparecen en ambas vistas y en detalle. Se comprobó la exclusión de un pedido no cancelado, la conservación del historial durante una caída simulada de SAP y los filtros de bodegas.

El informe reproducible está en `validacion-cancelaciones-sap.json`. Las capturas de `validacion-devueltos/` corresponden al frontend real con datos reales del repositorio, usando una API de prueba local y una identidad CONSULTA simulada, sin crear sesiones ni usuarios. Se verificaron escritorio, móvil y ausencia de errores JavaScript. Pasaron 30 pruebas de backend, 24 de frontend y ambas compilaciones; permanecen advertencias previas de tamaño CSS.
