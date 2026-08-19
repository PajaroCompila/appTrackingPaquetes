# Fase 6A–SAP — Operación y recuperación

## Estado y alcance

La aplicación consulta pedidos de RetailOne y pedidos mayoristas creados directamente en SAP Business One. Ambas fuentes son exclusivamente de lectura. La Fase 6B, entregas y cualquier operación transaccional permanecen en **NO-GO**.

## Arquitectura

- Frontend Angular/PrimeNG, puerto `4400`.
- Backend Node.js/Express, puerto `3280`.
- RetailOne: conexión y pool independientes al servidor autorizado `.150`; solo `SELECT`.
- SAP: conexión y pool independientes a `192.168.10.140/PAJARO_AZUL`; solo `SELECT`.
- Base propia `PedidosBodega`: historial y auditoría previamente autorizados; no participa en las consultas SAP.
- La unificación se realiza en el servicio del backend. No existe `UNION` entre servidores.

## Variables de entorno

Todas deben permanecer en `backend/.env`, nunca en el repositorio:

```dotenv
SISTEMA_ORIGEN_SQL_SERVIDOR=
SISTEMA_ORIGEN_SQL_PUERTO=1433
SISTEMA_ORIGEN_SQL_BASE_DATOS=
SISTEMA_ORIGEN_SQL_USUARIO=
SISTEMA_ORIGEN_SQL_CONTRASENA=
SAP_DB_HOST=192.168.10.140
SAP_DB_PORT=1433
SAP_DB_USER=
SAP_DB_PASSWORD=
SAP_DB_NAME=PAJARO_AZUL
PEDIDOS_BODEGA_SQL_SERVIDOR=
PEDIDOS_BODEGA_SQL_PUERTO=1433
PEDIDOS_BODEGA_SQL_BASE_DATOS=PedidosBodega
PEDIDOS_BODEGA_SQL_USUARIO=
PEDIDOS_BODEGA_SQL_CONTRASENA=
```

No registrar ni copiar valores sensibles en diagnósticos.

## Tablas consultadas

RetailOne: `@SO1_01VENTA`, `@SO1_01VENTADETALLE`, `@SO1_01SUCURSALALMA`, `@SO1_01SUCURSAL`, `OSLP` y tablas de campos definidos por el usuario ya autorizadas.

SAP: `ORDR`, `RDR1`, `OCRD`, `OCRG`, `OSLP`, `OWHS` y `CUFD`.

## Reglas empresariales comprobadas

- `ORDR.U_SO1_01RETAILONE = 'Y'`: pedido creado en R1; no se agrega desde SAP.
- `ORDR.U_SO1_01RETAILONE = 'N'`: candidato creado directamente en SAP.
- Mayoristas: `OCRD.GroupCode IN (103, 113)`, correspondientes a Mayoristas Clase A y B.
- Cola SAP: `ORDR.CANCELED = 'N'`, `ORDR.DocStatus = 'O'`, línea abierta y `RDR1.OpenQty > 0`.
- La cantidad mostrada para SAP es `OpenQty`, porque representa la cantidad pendiente.
- `NumAtCard` no clasifica el origen.

## Deduplicación y orden

La identidad es `R1:{folioPedido}` o `SAP:{DocEntry}`. Los pedidos SAP marcados `Y` se excluyen antes de unificar. No se eliminan registros solamente por número, fecha, cliente o vendedor. El orden es fecha/hora descendente y, como desempate, la identidad de origen. La paginación y el total cuentan pedidos, no artículos.

## Disponibilidad parcial

- SAP no disponible: se devuelve R1 y `fuentes.sap = 'no_disponible'`.
- RetailOne no disponible: se devuelve SAP y `fuentes.retailOne = 'no_disponible'`.
- Ambas no disponibles: error controlado `503`, sin datos técnicos.
- El frontend muestra una advertencia discreta cuando la lista está incompleta.

## Iniciar, detener y reiniciar

Backend:

```powershell
cd backend
npm.cmd run build
npm.cmd start
```

Frontend:

```powershell
cd frontend
npm.cmd start -- --host 0.0.0.0
```

Para detener, usar `Ctrl+C` en cada terminal. El backend cierra sus pools al recibir `SIGINT` o `SIGTERM`. Para reiniciar, detener de forma ordenada y ejecutar nuevamente los comandos; no finalizar SQL Server ni modificar bases.

## Salud y diagnóstico

1. Abrir `http://localhost:3280/api/salud`.
2. Abrir `http://localhost:4400` y comprobar Cola activa e Historial.
3. Si aparece información incompleta, identificar la fuente marcada `no_disponible` en la respuesta de `/api/pedidos`.
4. Verificar conectividad de red y variables requeridas sin imprimir sus valores.
5. Revisar únicamente mensajes sanitizados del backend.
6. Reiniciar solo frontend/backend. No reiniciar SQL Server, SAP ni RetailOne como parte del diagnóstico normal.
7. Si persiste, escalar al responsable de infraestructura indicando hora, ruta y código de seguimiento, nunca credenciales.

## Recuperación segura

Restaurar conectividad o configuración local correcta, reiniciar el backend y repetir salud y consulta. No ejecutar correcciones de datos, procedimientos, migraciones ni cambios de permisos. La consulta se recupera automáticamente cuando la fuente vuelve a estar disponible.

## Seguridad aceptada

La operación continúa temporalmente con `SA` por decisión registrada. Las credenciales se leen del entorno, `.env` está ignorado, las consultas de RetailOne y SAP pasan por barreras que solo admiten `SELECT`, las entradas se parametrizan y los pools tienen límites y cierre controlado.

## Riesgo aceptado en herramientas de desarrollo

`npm audit` informa tres vulnerabilidades moderadas fuera de producción: `@angular/cli` depende de `@modelcontextprotocol/sdk`, que utiliza una versión vulnerable de `@hono/node-server` ante recorrido de rutas con barras invertidas codificadas en Windows. La aplicación de producción no incluye estas dependencias y `npm audit --omit=dev` informa cero vulnerabilidades. Aunque `@hono/node-server 2.0.12` y `@modelcontextprotocol/sdk 1.30.0` ya contienen correcciones, la resolución automática disponible propone cambiar Angular CLI 22.1.2 a 21.0.4, lo que implica una versión mayor regresiva. No se aplica `audit fix --force`; el riesgo queda pendiente hasta que Angular CLI publique una resolución compatible con Angular 22.
