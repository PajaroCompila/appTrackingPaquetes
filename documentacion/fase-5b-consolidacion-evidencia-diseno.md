# Fase 5B — Consolidación de evidencia y diseño moderno de preparación y entrega

Fecha de consolidación: 30 de julio de 2026  
Estado: investigación incompleta; especificación conceptual consolidada  
Decisión: `GO conceptual` y `NO-GO técnico`

## 1. Resumen ejecutivo

La aplicación actual permite consultar almacenes, pedidos y partidas de SistemaOrigen. No posee autenticación y su API está restringida a solicitudes `GET`. No existe una operación transaccional de entrega en la aplicación nueva.

La investigación estática confirma relaciones y controles parciales en SistemaOrigen, pero no permite determinar qué ejecuta realmente `F8 - Entregar` en la aplicación heredada. Siguen sin comprobarse la entidad afectada, las precondiciones, los campos modificados, los movimientos de inventario, la integración con SAP, la auditoría, la unidad transaccional y la prevención de duplicados.

La pantalla heredada se conserva como fuente de evidencia para descubrir reglas que no deben perderse. No es la especificación visual ni funcional de la solución nueva.

Se aprueba como dirección de diseño un flujo guiado denominado `Preparar entrega`, con botones visibles, atajos opcionales, revisión, confirmación final, preparación asistida por escaneo, línea de tiempo auditable y un panel de preparación inteligente basado inicialmente en reglas deterministas. Esta aprobación no autoriza escrituras ni implica que sus reglas estén definidas.

## 2. Estado real del proyecto

### Confirmado

- Backend y frontend son proyectos independientes.
- El backend expone únicamente rutas `GET` para salud, almacenes y pedidos.
- La configuración CORS del backend admite únicamente `GET`.
- La consulta de pedidos utiliza parámetros SQL, paginación y columnas explícitas.
- El detalle del pedido limita la consulta a 1,000 partidas.
- La aplicación consulta `@SO1_01VENTA`, `@SO1_01VENTADETALLE` y `OWHS`.
- La aplicación web actual es de consulta y no posee autenticación.
- No hay endpoints de preparación, entrega, devolución o auditoría.
- No existe conexión implementada con SAP en el flujo actual.
- `sa` continúa siendo una cuenta `sysadmin` temporal, sin mínimo privilegio y no apta para producción.

### Línea base de datos conservada

```text
@SO1_01VENTA.Name
    =
@SO1_01VENTADETALLE.U_SO1_FOLIO
```

- `@SO1_01VENTA.Name` es el `folioPedido`.
- La llave lógica comprobada del detalle es `U_SO1_FOLIO + U_SO1_NUMPARTIDA`.
- `U_SO1_STATUSENTREGA` existe, pero su significado empresarial no está confirmado.
- Los códigos `A`, `C`, `N`, `Y` y los valores vacíos no tienen traducción empresarial comprobada.
- Existen 244 valores de almacén de detalle sin correspondencia confirmada con `OWHS`.
- `CUFD` y `UFD1` están vacías y no aportan traducciones de estados.

## 3. Fuentes inspeccionadas

| ID | Fuente | Alcance | Resultado |
|---|---|---|---|
| `IMG-F5-01` | Captura disponible en `imagenes/` | Pestaña Productos sin Despachar | Inspección visual directa |
| `IMG-F5-02` | Identificación visual proporcionada por el usuario | Pestaña Productos Despachados | Archivo binario no disponible localmente |
| `IMG-F5-03` | Identificación visual proporcionada por el usuario | Pestaña Productos de Pedidos Cerrados | Archivo binario no disponible localmente |
| `IMG-F5-04` | Identificación visual proporcionada por el usuario | Pestaña Productos Devueltos | Archivo binario no disponible localmente |
| `SRC-F5-01` | Repositorio backend y frontend | Rutas, consultas y estado funcional actual | Inspección estática |
| `SQL-F5-01` | `sys.tables`, `sys.columns` y `sys.types` | Columnas relevantes | Consulta de metadatos |
| `SQL-F5-02` | `sys.triggers` y `sys.trigger_events` | Triggers sobre cabecera y detalle | Consulta de metadatos |
| `SQL-F5-03` | `sys.sql_modules` | Definiciones exactas de triggers y vistas seleccionadas | Lectura estática; no se ejecutaron objetos |
| `SQL-F5-04` | `sys.sql_expression_dependencies` | Dependencias declaradas | Consulta de metadatos |
| `SQL-F5-05` | `sys.indexes`, restricciones y llaves foráneas | Llaves y controles declarados | Consulta de metadatos |
| `SQL-F5-06` | Distribuciones limitadas de estados | Valores existentes de cabecera y detalle | Consulta `SELECT` sin datos comerciales |

No se encontraron videos, código fuente de la aplicación heredada, manual funcional, logs previos de F8, comparaciones antes/después ni trazas autorizadas. Las capturas `IMG-F5-02` a `IMG-F5-04` se documentan exclusivamente según la identificación visual proporcionada por el usuario porque sus archivos binarios no están disponibles en el entorno.

## 4. Matriz de evidencias

| Evidencia | Hallazgo | Clasificación | Límite de la evidencia |
|---|---|---|---|
| `IMG-F5-01` | La pantalla muestra filtros de almacén y fecha, cuatro pestañas, `F5`, `F8`, `ESC` y una cuadrícula con partidas | Confirmada | No demuestra que F8 esté habilitado ni qué entidad procesa |
| `IMG-F5-02` | Productos Despachados no mostraba filas con los filtros visibles | Confirmada por identificación del usuario | No demuestra que el historial completo esté vacío |
| `IMG-F5-03` | Productos de Pedidos Cerrados mostraba partidas y algunas filas rosadas | Confirmada por identificación del usuario | El color no tiene significado empresarial confirmado |
| `IMG-F5-04` | Productos Devueltos mostraba varias partidas visualmente asociadas a un pedido y una fila azul | Confirmada por identificación del usuario | El resaltado no demuestra un estado ni el alcance de F8 |
| `SRC-F5-01` | La aplicación nueva es de consulta y solo expone rutas `GET` | Confirmada | No describe el comportamiento heredado de F8 |
| `SQL-F5-01` | Existen `U_SO1_STATUS`, `U_SO1_SINCRONIZADO`, `U_SO1_STATUSENTREGA`, `U_SO1_CANTIDAD`, `U_SO1_CANTIDADVERI` y `U_SO1_CANTPENDENT` | Confirmada | La existencia de columnas no prueba que F8 las modifique |
| `SQL-F5-02` | Hay tres triggers activos sobre cabecera y detalle | Confirmada | No se comprobó que F8 dispare una actualización alcanzada por ellos |
| `SQL-F5-03` | `SO1_TR_ACTUALIZARCANTPEND` revierte una actualización si la cantidad pendiente supera la original | Confirmada | Es una regla de integridad, no una especificación de F8 |
| `SQL-F5-03` | `trg_VentaEstadoPedidoDomicilio` rechaza transiciones concretas de estado para ciertos pedidos a domicilio | Confirmada | Su alcance es condicionado y no identifica el flujo de entrega de bodega |
| `SQL-F5-03` | `SO1_TR_PERMISOSOPERACIONES` valida permisos en inserciones de cabecera | Confirmada | No existe vínculo comprobado con F8 |
| `SQL-F5-04` | Vistas y funciones de documentos, ruteo y seguimiento referencian cabecera o detalle | Confirmada | El nombre de un objeto no demuestra que F8 lo use |
| `SQL-F5-04` | No aparecen servidor o base externos en las dependencias declaradas recuperadas | Confirmada para el conjunto consultado | No descarta integraciones desde código heredado o dependencias no declaradas |
| `SQL-F5-05` | No hay llaves foráneas declaradas hacia cabecera o detalle | Confirmada | Pueden existir relaciones lógicas no declaradas |
| `SQL-F5-05` | No se encontraron procedimientos cuyo nombre contenga `ENTREG`, `DESPACH` o `F8` | Confirmada | No descarta procedimientos con otros nombres o lógica en la aplicación heredada |
| `SQL-F5-06` | Todos los detalles observados en la distribución tenían `U_SO1_STATUSENTREGA = 'A'` | Confirmada para la consulta realizada | No permite traducir `A` ni observar una transición |
| Coincidencia temática | Tablas de despacho y traspaso contienen folios, estados y cantidades | Inferida como pista | No existe relación comprobada con pedidos ni con F8 |
| Controles de cantidades | F8 podría afectar cantidades pendientes | Inferida | Debe demostrarse con código o evidencia antes/después |
| Integración externa | F8 podría generar inventario o documentos externos | Pendiente | No hay evidencia estática suficiente |

## 5. Flujo conocido del sistema heredado

### Confirmado visualmente

La pantalla `Pedidos de Artículos por Almacén` presenta:

- Dos selectores o filtros visibles de almacén.
- Filtro de fecha.
- Botones `F5 - Actualizar`, `F8 - Entregar` y `ESC - Cerrar`.
- Pestañas Productos sin Despachar, Productos Despachados, Productos de Pedidos Cerrados y Productos Devueltos.
- Columnas relacionadas con código, cantidad, descripción, fecha, vendedor, almacén y hora.

### Pendiente

- Pestañas en las que F8 está realmente habilitado.
- Si la acción opera sobre un pedido, una partida o una selección múltiple.
- Campos que se envían al ejecutar la acción.
- Confirmaciones y validaciones previas.
- Mensajes de éxito y error.
- Cambios visibles posteriores.
- Permisos del operador.
- Significado del color rosado.
- Condición que clasifica una partida como despachada, cerrada o devuelta.
- Relación entre devoluciones y F8.

La presencia visual del botón F8 no demuestra que esté habilitado, que procese la fila resaltada ni que genere una entrega, devolución, movimiento de inventario o documento SAP.

## 6. Diferencias entre SistemaOrigen y la solución moderna

| Aspecto | Evidencia heredada | Dirección aprobada para el diseño moderno |
|---|---|---|
| Acción principal | Botón F8 con comportamiento desconocido | Botón visible `Preparar entrega`; F8 será un atajo opcional |
| Ejecución | No comprobada | F8 solo abrirá el flujo; nunca entregará inmediatamente |
| Selección | Resaltado visual ambiguo | Selección explícita dentro de un flujo guiado |
| Revisión | No comprobada | Revisión obligatoria antes de cualquier operación futura |
| Confirmación | No comprobada | Confirmación explícita final |
| Estados | Pestañas y colores sin semántica comprobada | Texto e indicadores; nunca solo color |
| Elegibilidad | No comprobada | Panel basado en reglas deterministas y explicables |
| Escaneo | No observado | Preparación asistida por escaneo como dirección de diseño |
| Auditoría | No comprobada | Línea de tiempo auditable como dirección de diseño |
| Duplicidad | No comprobada | Operación futura idempotente; mecanismo pendiente de diseño |
| Concurrencia | No comprobada | Validación y control en servidor; regla pendiente |

## 7. Clasificación de alcance

### Aprobado para el diseño

- Mantener `F5`, `F8` y `ESC` como atajos opcionales.
- Incluir botones visibles equivalentes.
- Utilizar siempre el botón visible como mecanismo principal.
- Hacer que `F8` abra el flujo `Preparar entrega`.
- Impedir que `F8` ejecute inmediatamente una entrega.
- Incorporar revisión y confirmación antes de cualquier operación.
- Diseñar preparación asistida por escaneo.
- Diseñar una línea de tiempo auditable.
- Diseñar un panel de preparación inteligente basado inicialmente en reglas deterministas.
- Mostrar estados mediante texto e indicadores, no únicamente mediante colores.

### Pendiente de validación empresarial y técnica

- Reglas exactas de entrega total y parcial.
- Modificación manual de cantidades.
- Código utilizado para escanear cada producto.
- Uso de código de barras, QR o ambos.
- Uso de cámara móvil.
- Pausar y reanudar preparaciones.
- Significado de los estados actuales.
- Significado del color rosado.
- Manejo de lotes, series o vencimientos.
- Reversión y devoluciones.
- Objetos SQL que deberán modificarse.
- Movimientos de inventario.
- Integración con SistemaOrigen o SAP.
- Contadores de las pestañas.
- Permisos definitivos por usuario y almacén.

### Fuera del alcance actual

- Implementar endpoints transaccionales.
- Implementar botones que escriban información.
- Ejecutar una entrega.
- Modificar tablas o procedimientos.
- Conectarse o escribir en SAP.
- Implementar autenticación.
- Desplegar en QA o producción.

## 8. Diseño conceptual de `Preparar entrega`

```text
Seleccionar un pedido
        |
        v
Ejecutar validación previa
        |
        v
Clasificar el pedido
  - Listo para preparar
  - Requiere revisión
  - Bloqueado
        |
        v
Explicar las reglas y razones aplicadas
        |
        v
Abrir Preparar entrega si corresponde
        |
        v
Mostrar partidas y cantidades pendientes
        |
        v
Verificar productos mediante un método autorizado
        |
        v
Mostrar progreso y advertencias
        |
        v
Presentar resumen final
        |
        v
Solicitar confirmación explícita
        |
        v
Ejecutar una única operación futura con idempotencia
        |
        v
Mostrar resultado y registrar el evento
```

Los pasos que implican cantidades, escritura, idempotencia, integración o clasificación empresarial son conceptuales hasta que sus reglas sean aprobadas.

### Atajos

| Atajo | Comportamiento aprobado |
|---|---|
| `F5` | Actualizar manteniendo filtros y pestaña cuando el navegador permita controlarlo; siempre existirá el botón `Actualizar` |
| `F8` | Abrir `Preparar entrega`; nunca confirmar ni escribir directamente |
| `ESC` | Cerrar el panel actual o regresar; solicitar confirmación si existen cambios sin guardar |

F8 deberá ignorarse cuando no exista un pedido seleccionado, el pedido esté bloqueado, el foco esté en un control incompatible, ya exista un flujo abierto o una operación esté siendo procesada.

## 9. Preparación asistida por escaneo

### Comportamiento propuesto

- Leer un identificador de producto mediante el mecanismo que posteriormente se apruebe.
- Compararlo con las partidas del pedido seleccionado.
- Mostrar progreso, por ejemplo, `4 de 7 partidas verificadas`.
- Advertir productos que no pertenezcan al pedido.
- Advertir lecturas duplicadas.
- Detectar cantidades inconsistentes o superiores a las pendientes.
- Permitir selección manual únicamente si se autoriza empresarialmente.
- Mantener siempre una revisión y confirmación final.
- No confirmar automáticamente una entrega al finalizar el escaneo.

### Pendiente

- Fuente del identificador escaneable.
- Relación comprobada entre código y artículo.
- Código de barras, QR o ambos.
- Unidad, caja o presentación representada.
- Uso de cámara móvil.
- Códigos alternativos.
- Lotes, series y vencimientos.
- Correcciones manuales y sus permisos.

No se inventará ninguna relación entre códigos y artículos.

## 10. Línea de tiempo auditable

### Eventos conceptuales

- Pedido creado.
- Preparación iniciada.
- Producto verificado.
- Validación rechazada.
- Confirmación solicitada.
- Operación confirmada o fallida.
- Entrega parcial o completa, si se aprueba esa regla.
- Devolución, si existe una fuente comprobada.
- Operación pendiente de conciliación.
- Conciliación completada.

### Datos conceptuales por evento

```text
tipo de evento
fecha y hora
usuario
almacén
pedido y partidas afectadas
resultado
identificador de operación
regla aplicada
motivo funcional
sistema de origen
```

La línea de tiempo distinguirá eventos comprobados de SistemaOrigen, eventos futuros de la nueva aplicación y confirmaciones de sistemas externos. No fabricará eventos históricos ni completará datos ausentes mediante inferencias.

## 11. Panel de preparación inteligente

El panel está aprobado como dirección de diseño. Sus reglas, datos, persistencia y ejecución continúan pendientes. Funcionará inicialmente mediante reglas empresariales deterministas; no se utilizará el término “inteligencia artificial”.

### Clasificaciones conceptuales

| Clasificación | Propósito |
|---|---|
| `Listo para preparar` | No se detectó una condición impeditiva según las reglas aprobadas |
| `Requiere revisión` | Existe una advertencia que necesita evaluación del operador |
| `Bloqueado` | Una regla aprobada impide iniciar o continuar |

Estas clasificaciones no traducen ni reemplazan los estados actuales de SistemaOrigen.

### Comportamiento propuesto

- Analizar elegibilidad antes de iniciar.
- Mostrar cada regla aplicada y su resultado.
- Mostrar el dato o validación faltante.
- Detectar almacenes sin correspondencia comprobada.
- Considerar expresamente los 244 valores sin correspondencia con `OWHS`.
- Detectar cantidades inconsistentes.
- Advertir operaciones previas pendientes de conciliación.
- Detectar otro operador preparando el mismo pedido.
- Bloquear pedidos cerrados o procesados únicamente cuando la regla sea confirmada.
- Permitir filtrar pedidos listos, con advertencias o bloqueados.
- Conservar evidencia de la regla aplicada cuando exista un mecanismo de auditoría autorizado.
- No corregir datos automáticamente.
- No aprobar pedidos automáticamente.
- No realizar escrituras.
- No reemplazar la decisión del operador.

Para los 244 valores de almacén sin correspondencia, el panel podrá señalar la inconsistencia, pero no decidirá si debe advertir o bloquear hasta obtener una regla empresarial. Tampoco propondrá una corrección automática.

## 12. Wireframes textuales

### Escritorio — Consulta y clasificación

```text
+-----------------------------------------------------------------------+
| Pedidos de bodega                                      [Actualizar]   |
+-----------------------------------------------------------------------+
| Buscar [____________]  Almacén [v]  Desde [ ]  Hasta [ ]              |
|                                                                       |
| [Sin despachar] [Despachados] [Cerrados] [Devueltos]                  |
+-----------------------------------------------------------------------+
| Clasificación       | Pedido | Fecha | Partidas | Almacén | Acción    |
| Listo para preparar | *****  | ***** | *****    | *****   | [Ver]     |
| Requiere revisión   | *****  | ***** | *****    | *****   | [Ver]     |
| Bloqueado           | *****  | ***** | *****    | *****   | [Ver]     |
+-----------------------------------------------------------------------+
| Razones del pedido seleccionado:                                     |
| - Almacén sin correspondencia confirmada                             |
| - Validación empresarial pendiente                                   |
|                                                                       |
| [Ver detalle]                              [Preparar entrega]          |
+-----------------------------------------------------------------------+
| Atajos opcionales: F5 Actualizar | F8 Preparar | ESC Regresar         |
+-----------------------------------------------------------------------+
```

### Escritorio — Preparación

```text
+-----------------------------------------------------------------------+
| Preparar entrega — Pedido *****                            [Cerrar]    |
+-----------------------------------------------------------------------+
| Clasificación: Requiere revisión                                      |
| Regla aplicada: almacén con correspondencia pendiente                 |
+-----------------------------------------------------------------------+
| Sel. | Código | Descripción | Solicitada | Pendiente | Verificación   |
| [ ]  | *****  | *****       | *****      | *****     | Pendiente      |
| [ ]  | *****  | *****       | *****      | *****     | Verificada     |
+-----------------------------------------------------------------------+
| Progreso: 1 de 2 partidas verificadas                                |
| [Iniciar preparación asistida]                                        |
|                                                                       |
| [Regresar]                                      [Revisar resumen]     |
+-----------------------------------------------------------------------+
```

Las cantidades editables y las entregas parciales no se presentan como capacidades aprobadas.

### Móvil — Consulta

```text
+------------------------------+
| Pedidos          [Actualizar]|
+------------------------------+
| Buscar [________________]    |
| Almacén [v]                  |
| Fecha [________]             |
+------------------------------+
| Sin despachar | Despachados  |
| Cerrados       | Devueltos   |
+------------------------------+
| Requiere revisión            |
| Pedido: *****                |
| Almacén: *****               |
| Razón: correspondencia de    |
| almacén pendiente            |
|                     [Ver]    |
+------------------------------+
| [Preparar entrega]           |
+------------------------------+
```

### Móvil — Preparación asistida

```text
+------------------------------+
| Preparar pedido *****        |
|                      [Cerrar]|
+------------------------------+
| Progreso                     |
| 4 de 7 verificadas           |
| [############--------]       |
+------------------------------+
| Código leído                 |
| [________________________]   |
|                              |
| Advertencia: producto no     |
| relacionado con el pedido    |
+------------------------------+
| [ ] ***** — Pendiente        |
| [x] ***** — Verificada       |
+------------------------------+
| [Revisar resumen]            |
+------------------------------+
```

El método real de lectura permanece pendiente.

## 13. Riesgos y controles

| Riesgo | Consecuencia | Control conceptual | Estado |
|---|---|---|---|
| Doble clic | Operación duplicada | Deshabilitar controles durante el procesamiento | Pendiente de implementación |
| Reintento de red | Documento o movimiento duplicado | Clave de idempotencia y consulta de resultado | Pendiente de arquitectura |
| Dos operadores | Sobreentrega o conflicto | Control de concurrencia en servidor | Regla pendiente |
| Estado desactualizado | Decisión basada en datos obsoletos | Revalidación inmediatamente antes de confirmar | Pendiente de diseño |
| Cantidad inconsistente | Sobreentrega o saldo incorrecto | Validación del servidor | Regla pendiente |
| Almacén no relacionado | Inventario o clasificación incorrectos | Mostrar regla y advertir o bloquear según decisión empresarial | Pendiente de decisión |
| Código incorrecto | Producto equivocado | Comparación determinista con una fuente aprobada | Fuente pendiente |
| Fallo parcial | Sistemas inconsistentes | Unidad transaccional y conciliación | Pendiente de arquitectura |
| SAP ambiguo o no disponible | Reintentos y duplicados | Idempotencia externa y conciliación | Integración no confirmada |
| Permisos insuficientes | Operación no autorizada | Autorización en servidor por usuario y almacén | Fuera del alcance actual |
| Auditoría incompleta | Falta de trazabilidad | Registro de intentos, reglas y resultados | Modelo pendiente |
| Uso de `sa` | Privilegios excesivos | Cuenta exclusiva de mínimo privilegio | Bloqueo de producción |

## 14. Preguntas para bodega y el proveedor del sistema heredado

### Para bodega

1. ¿F8 actúa sobre la fila seleccionada, varias partidas o todo el pedido?
2. ¿En cuáles pestañas está realmente habilitado?
3. ¿Qué selección y validación realiza el operador antes de presionarlo?
4. ¿Qué significan `A`, `C`, `N`, `Y` y vacío en cada contexto?
5. ¿Qué significa el color rosado?
6. ¿Cómo se reconoce una entrega total, parcial, cerrada o devuelta?
7. ¿Qué almacén representa cada selector visible?
8. ¿Cómo se corrigen diferencias de cantidad?
9. ¿Cómo se impide una entrega repetida?
10. ¿Qué mensaje y número de seguimiento recibe el operador?

### Para el proveedor del sistema heredado o responsable de SistemaOrigen

1. ¿Dónde está disponible el código fuente o manual de la pantalla heredada?
2. ¿Qué objetos y campos modifica F8?
3. ¿Qué transacción controla la operación y qué provoca rollback?
4. ¿Se crean despachos, traspasos, documentos SAP o movimientos de inventario?
5. ¿Cómo se manejan fallos parciales y reintentos?
6. ¿Qué permiso funcional requiere el operador?
7. ¿Dónde se auditan usuario, fecha, almacén, partidas y resultado?
8. ¿Existe una clave de idempotencia o control de duplicados?
9. ¿Cuál es la relación correcta para los almacenes que no coinciden con `OWHS`?
10. ¿Qué campo contiene el código de barras u otro identificador escaneable?

## 15. Plan propuesto para una futura prueba controlada en QA

Este plan no está autorizado para ejecución.

1. Preparar una copia aislada y autorizada de SistemaOrigen.
2. Aislar completamente SAP y cualquier servicio externo real.
3. Crear un pedido artificial sin información comercial.
4. Utilizar un usuario funcional autorizado y una cuenta SQL de mínimo privilegio.
5. Definir casos de entrega total, parcial, repetida, cerrada, cancelada y concurrente.
6. Obtener una línea base mediante consultas `SELECT` sobre cabecera, detalle, cantidades, estados, despacho, traspaso y auditoría candidata.
7. Ejecutar una sola acción controlada mediante un operador autorizado.
8. Comparar antes y después sin asumir relaciones por nombre.
9. Conservar capturas, mensajes, tiempos, identificadores y diferencias de datos.
10. Verificar efectos externos, transacción, rollback, auditoría e idempotencia.
11. Detener la prueba ante cualquier conexión real, dato comercial, efecto inesperado o resultado ambiguo.
12. Restaurar el ambiente mediante el método previamente aprobado por el responsable de QA.

No se incluyen sentencias de escritura en este plan.

## 16. Avance sustentado en entregables

Se informan métricas separadas para no confundir documentación con conocimiento funcional:

| Métrica | Base verificable | Avance |
|---|---|---:|
| Entregable documental de Fase 5B | 17 secciones solicitadas presentes en este informe | 100% |
| Evidencias visuales con binario accesible | 1 de 4 capturas disponibles localmente | 25% |
| Criterios críticos para cerrar la investigación de F8 | 0 de 10 criterios completamente demostrados | 0% |

Los diez criterios críticos aún no están completamente demostrados: entidad, precondiciones, objetos participantes, campos modificados, movimientos o documentos, integraciones, transacción y errores, duplicidad, permisos y auditoría. Existen evidencias parciales sobre objetos y controles SQL, pero ninguna permite cerrar de extremo a extremo el comportamiento de F8.

El 100% documental significa que la consolidación autorizada fue preparada; no significa que la Fase 5 esté completa ni que una operación transaccional pueda implementarse.

## 17. Decisión final

### `GO conceptual`

Autorizable únicamente para continuar investigación estática, diseño, validación con usuarios y preparación de una futura prueba controlada.

### `NO-GO técnico`

No es seguro implementar operaciones transaccionales mientras no se confirmen los efectos reales sobre SistemaOrigen, inventario, SAP, permisos, auditoría, transacciones, concurrencia e idempotencia.

La Fase 5 permanece incompleta. No debe avanzarse a la Fase 6 ni implementarse una entrega sin autorización expresa.

## Anexo A — Consultas de investigación ejecutadas

Se ejecutaron únicamente consultas `SELECT` de metadatos y distribuciones limitadas sobre:

- `sys.tables`, `sys.schemas`, `sys.columns` y `sys.types`.
- `sys.triggers` y `sys.trigger_events`.
- `sys.sql_modules` para definiciones exactas seleccionadas.
- `sys.sql_expression_dependencies`.
- `sys.indexes`, `sys.index_columns`, restricciones y llaves foráneas.
- `sys.procedures` por coincidencias de nombre limitadas.
- Distribuciones de `U_SO1_STATUS` y `U_SO1_STATUSENTREGA` sin folios ni datos comerciales.

Una consulta de catálogo utilizó inicialmente una columna incorrecta de `sys.triggers`, devolvió un error de solicitud y no produjo cambios. Se corrigió y se repitió solo el bloque de metadatos afectado.

No se ejecutaron procedimientos, funciones de comportamiento desconocido, escrituras, F8, SAP, trazas ni cambios de configuración.
