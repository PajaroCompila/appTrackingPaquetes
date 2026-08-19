# Pedidos Bodega

Aplicación interna para consultar pedidos de SistemaOrigen antes de que finalice su sincronización con SAP Business One.

## Estado

La aplicación consulta la cola activa de SistemaOrigen y conserva un historial derivado en una base propia. SistemaOrigen es estrictamente de lectura y la base `PedidosBodega` es el único destino autorizado para datos de la aplicación.

La operación transaccional de entrega continúa fuera de alcance.

## Conexiones separadas

- `SISTEMA_ORIGEN_SQL_*`: conexión operativa a SistemaOrigen; el código solo admite `SELECT`.
- `PEDIDOS_BODEGA_SQL_*`: conexión independiente para usuarios, historial y auditoría local.
- `SQL_*`: identidad administrativa local utilizada exclusivamente por el aprovisionamiento inicial.

Por decisión temporal aceptada, ambas conexiones pueden usar `sa`, pero conservan variables y pools separados. SQL Server no garantiza solo lectura con una cuenta `sysadmin`: la restricción de SistemaOrigen depende de la barrera de consultas del backend. Esta excepción debe reemplazarse por identidades de mínimo privilegio antes de producción.

El backend rechaza el arranque si la base propia no es exactamente `192.168.10.150/PedidosBodega` o si SistemaOrigen apunta a `master` o a la base propia. La identidad `pedidos_bodega_app` se conserva, aunque temporalmente no se utiliza.

## Aprovisionamiento inicial

Con la configuración administrativa disponible únicamente en `backend/.env`:

```powershell
cd backend
npm.cmd run db:provision
```

El comando crea `PedidosBodega` cuando no existe, aplica migraciones, crea la identidad mínima `pedidos_bodega_app` y guarda localmente su configuración. No crea objetos de la aplicación en `master` ni modifica SistemaOrigen.

La identidad de solo lectura de SistemaOrigen debe ser creada o proporcionada externamente; el aprovisionador no ejecuta DDL en SistemaOrigen.

## Desarrollo

Backend:

```powershell
cd backend
npm.cmd run dev
```

Frontend, en otra terminal:

```powershell
cd frontend
npm.cmd start
```

- Frontend: `http://localhost:4400`
- API: `http://localhost:3280`
