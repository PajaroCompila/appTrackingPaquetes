# Fase 5C — Cierre de brechas y paquete de validación

Fecha: 30 de julio de 2026  
Línea base: `fase-5b-consolidacion-evidencia-diseno.md`  
Estado: paquete preparado; investigación funcional de F8 incompleta  
Decisiones vigentes: `GO conceptual` y `NO-GO técnico`

## 1. Propósito y límites

Este documento convierte los diez criterios críticos pendientes sobre `F8 - Entregar` en actividades verificables para bodega, el proveedor del sistema heredado, DBA, responsables de integraciones y una futura prueba controlada en QA.

La finalidad de estudiar F8 es recuperar reglas empresariales y efectos técnicos que no deben perderse. No se pretende copiar la experiencia de usuario heredada.

Este paquete:

- No autoriza ejecutar F8.
- No autoriza entregas ni escrituras.
- No autoriza procedimientos, trazas o acceso a SAP.
- No autoriza pruebas en producción.
- No autoriza la Fase 6A ni la Fase 6B.
- No modifica el informe de Fase 5B.

Las coincidencias de nombres se consideran pistas y nunca evidencia confirmada de una relación.

## 2. Línea base confirmada

- `@SO1_01VENTA.Name = @SO1_01VENTADETALLE.U_SO1_FOLIO`.
- `@SO1_01VENTA.Name` representa el `folioPedido`.
- La llave lógica del detalle es `U_SO1_FOLIO + U_SO1_NUMPARTIDA`.
- Existen columnas de estado, sincronización, cantidades y almacén, pero no se demostró cuáles modifica F8.
- Existen tres triggers activos sobre cabecera o detalle.
- No se encontraron procedimientos cuyo nombre contenga `ENTREG`, `DESPACH` o `F8`.
- No existen llaves foráneas declaradas entre cabecera o detalle y los objetos candidatos inspeccionados.
- Los significados empresariales de `A`, `C`, `N`, `Y`, vacío y del color rosado no están confirmados.
- Existen 244 valores de almacén de detalle sin correspondencia confirmada con `OWHS`.
- `CUFD` y `UFD1` están vacías.
- La aplicación nueva expone únicamente consultas `GET` y no posee autenticación.
- `sa` sigue siendo una cuenta administrativa temporal y no apta para producción.
- `IMG-F5-01` tiene archivo binario accesible.
- `IMG-F5-02`, `IMG-F5-03` e `IMG-F5-04` continúan como evidencia visual provisional basada en la identificación proporcionada por el usuario; sus binarios no están disponibles localmente.

## 3. Matriz de cierre de los diez criterios

| ID | Criterio crítico | Evidencia confirmada actual | Evidencia faltante | Fuente responsable | Acción necesaria | Evidencia aceptable | Estado | Bloquea Fase 6 |
|---|---|---|---|---|---|---|---|---|
| `CR-01` | Entidad sobre la que actúa F8 | La pantalla muestra partidas en una cuadrícula y un botón F8 | Alcance real: pedido, partida o selección múltiple | Bodega y proveedor del sistema heredado | Documentar selección previa y revisar código del evento | Video o demostración autorizada en QA más código o especificación que identifique la entidad | Pendiente | 6B: sí; 6A: condiciona textos y selección |
| `CR-02` | Precondiciones | Hay filtros, pestañas y controles visuales; existen estados SQL | Reglas de habilitación, elegibilidad, cantidades, almacén y estado | Bodega y proveedor del sistema heredado | Entregar matriz de habilitación y casos rechazados | Regla firmada, captura de control habilitado/deshabilitado y evidencia QA reproducible | Parcialmente demostrado | 6B: sí; 6A: condiciona mensajes y bloqueos |
| `CR-03` | Objetos SQL involucrados | Se confirmaron cabecera, detalle, tres triggers y dependencias declaradas | Objeto o código que inicia la operación y cadena completa de llamadas | Proveedor del sistema heredado y DBA | Revisar código heredado y mapa de dependencias exacto | Código autorizado, definiciones SQL y diagrama con cada lectura o escritura | Parcialmente demostrado | 6B: sí; 6A: no para maqueta estrictamente no transaccional |
| `CR-04` | Campos modificados | Existen campos candidatos de estado y cantidad | Lista exacta de columnas, valores anteriores/nuevos y orden de cambio | Proveedor del sistema heredado y DBA | Comparar código con observación antes/después en QA | Diff anonimizado de `SELECT` y referencia al código que realiza cada cambio | Parcialmente demostrado | 6B: sí; 6A: no para maqueta no transaccional |
| `CR-05` | Movimientos o documentos adicionales | Existen tablas y vistas con nombres de despacho, traspaso, documentos y ruteo | Relación causal con F8 y documentos creados | Proveedor del sistema heredado, DBA y responsable de SAP | Trazar el diseño estático y comprobarlo en QA aislado | Identificadores ficticios antes/después y definiciones que expliquen su creación | Pendiente | 6B: sí; 6A: no si no promete efectos |
| `CR-06` | Comunicación con SAP u otro servicio | No se confirmó dependencia externa desde los objetos SQL recuperados | Llamadas desde código heredado, protocolo, respuesta y reintentos | Proveedor del sistema heredado y responsable de integraciones | Revisar código/configuración no sensible y observar QA aislado | Diagrama de secuencia, contrato técnico y logs anonimizados de QA | Bloqueado por fuente externa | 6B: sí; 6A: no si omite afirmaciones de integración |
| `CR-07` | Transacciones, errores y rollback | Dos triggers contienen rollback ante reglas específicas | Frontera transaccional de F8, manejo de fallos parciales y mensajes | Proveedor del sistema heredado y DBA | Entregar código transaccional y ejecutar casos controlados de QA | Código, diagrama, mensajes y comparación antes/después tras fallo controlado | Parcialmente demostrado | 6B: sí; 6A: condiciona solo diseño de errores |
| `CR-08` | Prevención de entregas duplicadas | No existe evidencia confirmada de idempotencia | Clave, restricción, bloqueo o regla que impide repetir | Proveedor del sistema heredado y DBA | Identificar mecanismo y probar repetición en QA | Restricción o código verificable más dos intentos controlados con un solo efecto | Pendiente | 6B: sí; 6A: no si no simula éxito |
| `CR-09` | Permisos necesarios | Existe un trigger de permisos para inserciones de cabecera; `sa` es sysadmin | Permiso funcional de F8, rol, alcance por almacén y permisos SQL mínimos | Bodega, proveedor del sistema heredado y DBA | Documentar matriz de roles y probar con usuarios QA | Matriz aprobada y evidencias de permitido/denegado sin usar cuentas administrativas | Parcialmente demostrado | 6B: sí; 6A: condiciona visibilidad, no una maqueta sin autenticación |
| `CR-10` | Auditoría registrada | Existen tablas candidatas por nombre, sin vínculo comprobado | Evento, usuario, fecha, almacén, partidas, resultado y fallos | Proveedor del sistema heredado y DBA | Identificar escrituras de auditoría y observarlas en QA | Definición técnica y registros anonimizados antes/después | Pendiente | 6B: sí; 6A: no si la línea de tiempo se presenta como diseño vacío |

Crear este documento no cambia el estado de los criterios ni aumenta su porcentaje de resolución.

## 4. Fuentes de evidencia y responsabilidades

### 4.1 Inspección estática autorizada

Puede aportar evidencia para `CR-03`, `CR-04`, `CR-05`, `CR-06`, `CR-07`, `CR-08`, `CR-09` y `CR-10` mediante:

- Código heredado autorizado, si aparece.
- Definiciones de triggers, procedimientos, vistas y funciones.
- Dependencias declaradas y no declaradas documentadas por el proveedor.
- Parámetros y configuración no sensible.
- Scripts SQL y documentación técnica.
- Consultas `SELECT` limitadas de metadatos.

La inspección estática puede demostrar que una instrucción existe, pero no siempre que la ruta F8 la ejecute en producción.

### 4.2 Validación con bodega

Debe resolver principalmente `CR-01`, `CR-02` y `CR-09`, y aportar contexto a `CR-05`, `CR-08` y `CR-10`:

- Selección operativa real.
- Entrega total o parcial.
- Habilitación por pestaña.
- Significado de colores y estados visibles.
- Repeticiones accidentales.
- Devoluciones.
- Perfiles funcionales.
- Mensajes de éxito o error.

Una explicación verbal sin demostración, captura o documento se registra como testimonio, no como confirmación técnica.

### 4.3 Validación con el proveedor del sistema heredado

Debe aportar la lógica exacta para todos los criterios, especialmente:

- Evento asociado a F8.
- Objetos ejecutados y campos cambiados.
- Transacción y manejo de errores.
- Inventario, documentos e integraciones.
- Idempotencia y concurrencia.
- Auditoría y permisos.

### 4.4 Validación con DBA o responsable técnico

Debe comprobar `CR-03`, `CR-04`, `CR-07`, `CR-08`, `CR-09` y `CR-10`:

- Objetos y columnas afectados.
- Triggers y dependencias.
- Índices, restricciones y relaciones lógicas.
- Bloqueos y concurrencia.
- Usuarios y permisos mínimos.
- Tablas y retención de auditoría.

### 4.5 Validación con responsable de SAP o integraciones

Debe comprobar `CR-05`, `CR-06`, `CR-07` y `CR-08`:

- Documento o movimiento externo.
- API, Service Layer, DI API, cola, archivo u otro mecanismo.
- Clave de correlación.
- Reintentos, timeouts e idempotencia.
- Conciliación de resultados ambiguos.

### 4.6 Observación futura en QA

Los siguientes puntos necesitan evidencia antes/después en un ambiente aislado, aunque exista documentación:

- Alcance efectivo de la selección de F8.
- Campos y objetos realmente modificados.
- Entrega total y parcial.
- Repetición e idempotencia.
- Concurrencia entre operadores.
- Efectos de pedido cerrado, cancelado o ya entregado.
- Creación de movimientos o documentos.
- Comunicación externa y resultados ambiguos.
- Auditoría de éxito y fallo.
- Rollback ante fallos controlados.
- Reversión o devolución posterior.

## 5. Cuestionarios listos para enviar

### 5.1 Operador o supervisor de bodega

| ID | Destinatario | Pregunta exacta | Criterio que resuelve | Evidencia que debe entregar |
|---|---|---|---|---|
| `BOD-01` | Operador/supervisor | Antes de presionar F8, ¿selecciona una fila, varias partidas o un pedido completo? | `CR-01` | Captura o demostración autorizada que muestre la selección inmediatamente anterior |
| `BOD-02` | Operador/supervisor | ¿En qué pestañas y bajo qué condiciones observa F8 habilitado? | `CR-02` | Capturas comparables de habilitado y deshabilitado con filtros anonimizados |
| `BOD-03` | Operador/supervisor | ¿Puede entregar una cantidad menor a la solicitada y qué sucede con el saldo? | `CR-01`, `CR-02`, `CR-04` | Procedimiento operativo aprobado o demostración en QA con datos ficticios |
| `BOD-04` | Operador/supervisor | ¿Qué significan operativamente los estados visibles y el fondo rosado? | `CR-02` | Manual, leyenda oficial o validación firmada por el responsable del proceso |
| `BOD-05` | Operador/supervisor | ¿Qué ocurre cuando se presiona F8 dos veces o sobre un pedido ya procesado? | `CR-08` | Evidencia histórica autorizada o demostración futura en QA |
| `BOD-06` | Operador/supervisor | ¿Qué perfil o permiso necesita y el permiso cambia por almacén? | `CR-09` | Matriz de roles o capturas de acceso permitido y denegado |
| `BOD-07` | Operador/supervisor | ¿Qué mensaje, folio o comprobante aparece al completar o fallar la operación? | `CR-05`, `CR-07`, `CR-10` | Captura anonimizada de éxito y error generada previamente o en QA |
| `BOD-08` | Operador/supervisor | ¿Las devoluciones se originan desde F8 o desde otro proceso? | `CR-01`, `CR-05` | Procedimiento operativo o demostración autorizada |

### 5.2 Proveedor del sistema heredado

| ID | Destinatario | Pregunta exacta | Criterio que resuelve | Evidencia que debe entregar |
|---|---|---|---|---|
| `SOL-01` | Proveedor del sistema heredado | ¿Qué evento, método o módulo recibe F8 y cuál es la entidad de entrada? | `CR-01` | Código fuente autorizado y ruta de llamada |
| `SOL-02` | Proveedor del sistema heredado | ¿Cuál es la expresión completa que habilita o bloquea F8? | `CR-02` | Código o especificación con cada condición y su mensaje |
| `SOL-03` | Proveedor del sistema heredado | ¿Qué consultas, procedimientos, funciones o servicios se invocan, en orden? | `CR-03`, `CR-06` | Diagrama de secuencia y definiciones técnicas |
| `SOL-04` | Proveedor del sistema heredado | ¿Qué tablas y columnas se insertan o actualizan y con qué valores? | `CR-04` | Mapa de escritura con origen y destino de cada campo |
| `SOL-05` | Proveedor del sistema heredado | ¿F8 crea despachos, traspasos, movimientos de inventario o documentos adicionales? | `CR-05` | Código, contrato y ejemplos anonimizados de QA |
| `SOL-06` | Proveedor del sistema heredado | ¿Se comunica con SAP u otro servicio y cómo correlaciona la respuesta? | `CR-06` | Contrato de integración y diagrama sin credenciales |
| `SOL-07` | Proveedor del sistema heredado | ¿Cuál es la frontera transaccional y qué sucede si falla cada paso? | `CR-07` | Código transaccional, tabla de errores y estrategia de rollback |
| `SOL-08` | Proveedor del sistema heredado | ¿Qué mecanismo evita entregas duplicadas o reintentos con doble efecto? | `CR-08` | Clave, restricción o algoritmo verificable de idempotencia |
| `SOL-09` | Proveedor del sistema heredado | ¿Qué permisos funcionales y técnicos valida F8? | `CR-09` | Matriz de permisos y código que la aplica |
| `SOL-10` | Proveedor del sistema heredado | ¿Qué auditoría registra intentos exitosos y fallidos? | `CR-10` | Esquema, código y política de retención |

### 5.3 DBA

| ID | Destinatario | Pregunta exacta | Criterio que resuelve | Evidencia que debe entregar |
|---|---|---|---|---|
| `DBA-01` | DBA | ¿Qué objetos pueden escribir directa o indirectamente en cabecera y detalle durante la entrega? | `CR-03` | Dependencias revisadas y definiciones completas |
| `DBA-02` | DBA | ¿Qué columnas cambian y qué restricciones o triggers se activan? | `CR-04`, `CR-07` | Mapa de columnas, restricciones y triggers |
| `DBA-03` | DBA | ¿Qué objetos de despacho, traspaso, inventario o auditoría se relacionan lógicamente con el pedido? | `CR-05`, `CR-10` | Relaciones demostradas mediante código, índices o datos ficticios correlacionados |
| `DBA-04` | DBA | ¿Qué nivel de bloqueo o control evita que dos sesiones procesen el mismo pedido? | `CR-07`, `CR-08` | Diseño de concurrencia y prueba controlada en QA |
| `DBA-05` | DBA | ¿Cuál es el conjunto mínimo de permisos SQL para la futura operación? | `CR-09` | Script de permisos revisable, sin ejecutarlo, y matriz de acceso |
| `DBA-06` | DBA | ¿Dónde se registra el usuario funcional si la conexión SQL usa una identidad técnica? | `CR-09`, `CR-10` | Diseño de propagación de identidad y registro auditable |
| `DBA-07` | DBA | ¿Cómo se detecta y concilia una operación incompleta o ambigua? | `CR-07`, `CR-08`, `CR-10` | Consulta de conciliación y estados documentados, sin escritura |

### 5.4 Responsable de SAP o integraciones

| ID | Destinatario | Pregunta exacta | Criterio que resuelve | Evidencia que debe entregar |
|---|---|---|---|---|
| `INT-01` | SAP/integraciones | ¿F8 genera o actualiza algún documento SAP? | `CR-05`, `CR-06` | Tipo de objeto, contrato y ejemplo ficticio correlacionado |
| `INT-02` | SAP/integraciones | ¿Qué mecanismo técnico usa SistemaOrigen para comunicarse con SAP? | `CR-06` | Diagrama y configuración no sensible |
| `INT-03` | SAP/integraciones | ¿Qué identificador evita duplicar un documento ante reintentos? | `CR-08` | Campo o clave de idempotencia y regla de búsqueda |
| `INT-04` | SAP/integraciones | ¿Qué ocurre si SAP procesa la solicitud pero la respuesta no llega? | `CR-06`, `CR-07`, `CR-08` | Procedimiento de conciliación y evidencia QA |
| `INT-05` | SAP/integraciones | ¿Dónde se registran solicitud, respuesta y error sin exponer datos sensibles? | `CR-10` | Esquema de log, retención y ejemplo anonimizado |
| `INT-06` | SAP/integraciones | ¿Cómo se aísla SAP en QA y qué sustituto controlado se utiliza? | `CR-06`, `CR-07` | Plan de aislamiento aprobado |

No debe marcarse un criterio como confirmado con respuestas ambiguas, recuerdos no verificables o coincidencias de nombres.

## 6. Protocolo futuro de observación en QA

### Condiciones generales

- Ambiente aislado y autorizado, nunca producción.
- Pedido, artículos, almacenes y usuarios ficticios.
- SAP real y servicios externos completamente aislados.
- Cuenta SQL de mínimo privilegio.
- Operador funcional autorizado.
- Línea base y resultado obtenidos mediante `SELECT` limitados y anonimizados.
- Método de restauración probado y aprobado antes de comenzar.
- Un caso por ambiente restaurado cuando exista riesgo de contaminación cruzada.

### `QA-F8-01` — Entrega total

- **Objetivo:** determinar entidad, campos, objetos y efectos de una entrega total.
- **Precondiciones:** pedido ficticio elegible con todas sus partidas disponibles; reglas aprobadas antes de ejecutar.
- **Datos ficticios:** un pedido, al menos dos partidas y un almacén QA válido.
- **Línea base:** cabecera, detalle, cantidades, estados, objetos candidatos, auditoría e integraciones aisladas.
- **Acción futura:** un operador autorizado seleccionará la entidad definida y ejecutará una única vez el flujo heredado.
- **Objetos a observar:** cabecera, detalle, triggers, despacho, traspaso, inventario, documentos y auditoría identificados previamente.
- **Resultado esperado:** pendiente de definición; no ejecutar hasta contar con una regla empresarial firmada.
- **Evidencia:** capturas, mensajes, diferencias `SELECT`, identificadores y tiempos.
- **Detención:** cualquier conexión real, dato no ficticio, objeto inesperado o resultado ambiguo.
- **Restauración:** restauración del ambiente aislado mediante el procedimiento aprobado por QA/DBA.

### `QA-F8-02` — Entrega parcial

- **Objetivo:** determinar si se admite una cantidad menor y cómo queda el saldo.
- **Precondiciones:** regla de entrega parcial aprobada; pedido ficticio con cantidad mayor que uno.
- **Datos ficticios:** pedido con una partida divisible y existencias controladas.
- **Línea base:** cantidades solicitada, verificada, pendiente y cualquier estado asociado.
- **Acción futura:** el operador ingresará o seleccionará la cantidad parcial según la interfaz autorizada.
- **Objetos a observar:** detalle, cabecera, inventario, documentos, auditoría y saldo pendiente.
- **Resultado esperado:** pendiente; no asumir que la entrega parcial existe.
- **Evidencia:** valores antes/después y presentación posterior de la partida.
- **Detención:** si la interfaz no ofrece una opción explícita o la regla no está aprobada.
- **Restauración:** procedimiento aprobado de restauración completa del ambiente.

### `QA-F8-03` — Repetición accidental

- **Objetivo:** comprobar idempotencia y comportamiento ante doble ejecución.
- **Precondiciones:** mecanismo de protección identificado; pedido ficticio restaurable.
- **Datos ficticios:** pedido elegible y un identificador de operación observable.
- **Línea base:** estados, documentos, movimientos, auditoría y claves de correlación.
- **Acción futura:** el operador autorizado repetirá la misma intención conforme al guion aprobado, sin automatización agresiva.
- **Objetos a observar:** todos los objetos modificados por el primer intento y registros de rechazo del segundo.
- **Resultado esperado:** un solo efecto empresarial, únicamente si esa regla es aprobada previamente.
- **Evidencia:** ambos intentos, mensajes y conteo limitado de efectos correlacionados.
- **Detención:** si no existe mecanismo identificado o el primer intento produce resultado ambiguo.
- **Restauración:** restauración completa antes de otro caso.

### `QA-F8-04` — Pedido previamente entregado

- **Objetivo:** comprobar la regla que impide o controla un reproceso.
- **Precondiciones:** estado “entregado” definido y pedido ficticio preparado mediante un caso previo controlado.
- **Datos ficticios:** pedido procesado con evidencia completa.
- **Línea base:** estado final, cantidades, documentos y auditoría del primer proceso.
- **Acción futura:** el operador intentará abrir o ejecutar nuevamente la acción según el guion autorizado.
- **Objetos a observar:** estado, auditoría, documentos y mensajes.
- **Resultado esperado:** pendiente hasta confirmar la regla de reproceso.
- **Evidencia:** habilitación del control, mensaje y ausencia o presencia justificada de efectos.
- **Detención:** cualquier efecto no previsto por la regla aprobada.
- **Restauración:** procedimiento aprobado del ambiente QA.

### `QA-F8-05` — Pedido cerrado o cancelado

- **Objetivo:** identificar elegibilidad y mensajes para estados no activos.
- **Precondiciones:** significado de cerrado y cancelado validado.
- **Datos ficticios:** un pedido cerrado y otro cancelado.
- **Línea base:** estados, fechas de cierre/cancelación y partidas.
- **Acción futura:** el operador seleccionará cada pedido y observará o intentará abrir F8 según el protocolo.
- **Objetos a observar:** cabecera, detalle, auditoría de intento y mensajes.
- **Resultado esperado:** pendiente; el bloqueo solo se espera cuando la regla esté firmada.
- **Evidencia:** controles habilitados/deshabilitados y resultados anonimizados.
- **Detención:** si el estado no puede establecerse de forma autorizada en el ambiente.
- **Restauración:** restauración del conjunto QA.

### `QA-F8-06` — Artículo inexistente

- **Objetivo:** comprobar validación y tratamiento de una referencia de artículo inválida.
- **Precondiciones:** caso preparado por DBA mediante datos ficticios válidos para QA, no alteración improvisada.
- **Datos ficticios:** pedido diseñado específicamente con una referencia controlada no resoluble.
- **Línea base:** detalle, catálogo de artículos, mensajes y objetos de error.
- **Acción futura:** el operador abrirá el flujo autorizado sin forzar modificaciones adicionales.
- **Objetos a observar:** detalle, auditoría, logs anonimizados y ausencia de movimientos.
- **Resultado esperado:** pendiente; debe definirse el rechazo funcional esperado.
- **Evidencia:** mensaje, regla aplicada y datos sin cambios cuando así se apruebe.
- **Detención:** si crear el caso exige alterar producción o romper integridad no restaurable.
- **Restauración:** restauración aprobada de la copia QA.

### `QA-F8-07` — Almacén sin correspondencia

- **Objetivo:** resolver el tratamiento de los valores que no coinciden con `OWHS`.
- **Precondiciones:** usar un valor ficticio o copia autorizada representativa; no corregir los 244 valores reales.
- **Datos ficticios:** pedido con una partida cuyo almacén no tenga correspondencia en QA.
- **Línea base:** código de almacén en detalle, catálogo `OWHS` y estado del pedido.
- **Acción futura:** el operador intentará abrir el flujo conforme al guion aprobado.
- **Objetos a observar:** validaciones, mensajes, auditoría y ausencia o presencia de efectos justificados.
- **Resultado esperado:** pendiente de decisión entre advertencia y bloqueo.
- **Evidencia:** regla aplicada, mensaje y comparación antes/después.
- **Detención:** si el sistema propone o aplica una corrección automática no aprobada.
- **Restauración:** restauración del ambiente aislado.

### `QA-F8-08` — Falla de sincronización

- **Objetivo:** comprobar estado, reintento y conciliación ante una sincronización fallida.
- **Precondiciones:** sustituto de integración aislado capaz de devolver un error controlado; plan aprobado.
- **Datos ficticios:** pedido y respuesta de error sintética.
- **Línea base:** estado de sincronización, correlación, auditoría y objetos locales.
- **Acción futura:** el operador ejecutará una vez mientras el sustituto responde con el error previsto.
- **Objetos a observar:** estado local, logs anonimizados, auditoría, documentos y cola si existe.
- **Resultado esperado:** pendiente hasta conocer la arquitectura de integración.
- **Evidencia:** solicitud/respuesta sintética, mensaje y estado conciliable.
- **Detención:** cualquier intento de acceder a un servicio real.
- **Restauración:** reinicio del sustituto y restauración de la base QA.

### `QA-F8-09` — Indisponibilidad de SQL

- **Objetivo:** observar el manejo de una dependencia SQL no disponible sin provocar una falla real.
- **Precondiciones:** ambiente desechable y mecanismo de simulación aprobado por DBA.
- **Datos ficticios:** pedido ficticio ya cargado en el ambiente.
- **Línea base:** salud del ambiente, estados y auditoría previa.
- **Acción futura:** un responsable técnico aplicará el mecanismo de simulación autorizado; el operador realizará el paso acordado.
- **Objetos a observar:** mensaje, timeout, reintento y ausencia de efectos parciales.
- **Resultado esperado:** pendiente; debe aprobarse el contrato de error antes de ejecutar.
- **Evidencia:** tiempos, mensaje, logs anonimizados y verificación posterior.
- **Detención:** si la prueba afecta infraestructura compartida o requiere producción.
- **Restauración:** restablecimiento documentado del servicio QA y verificación de integridad.

### `QA-F8-10` — Indisponibilidad de SAP

- **Objetivo:** determinar comportamiento y conciliación cuando la integración aislada no responde.
- **Precondiciones:** confirmar primero que F8 utiliza SAP; emplear sustituto aislado.
- **Datos ficticios:** pedido y endpoint sintético de QA.
- **Línea base:** datos locales, correlación y auditoría.
- **Acción futura:** el responsable del sustituto aplicará el escenario aprobado y el operador ejecutará una sola intención.
- **Objetos a observar:** estados locales, reintentos, auditoría y ausencia de duplicados.
- **Resultado esperado:** pendiente hasta confirmar integración y estrategia.
- **Evidencia:** logs del sustituto, mensaje, correlación y conciliación posterior.
- **Detención:** cualquier conexión a SAP real o resultado externo ambiguo sin mecanismo de consulta.
- **Restauración:** restauración de base y sustituto QA.

### `QA-F8-11` — Dos operadores sobre el mismo pedido

- **Objetivo:** comprobar concurrencia y propiedad temporal de la preparación.
- **Precondiciones:** dos usuarios QA, regla de concurrencia aprobada y sincronización manual del caso.
- **Datos ficticios:** un pedido elegible y dos sesiones autorizadas.
- **Línea base:** versión, estado, bloqueos lógicos, auditoría e identificadores de operación.
- **Acción futura:** dos operadores seguirán el guion controlado sobre el mismo pedido.
- **Objetos a observar:** bloqueos, resultados, mensajes, documentos y auditoría de ambos intentos.
- **Resultado esperado:** un solo efecto empresarial, únicamente si esa regla es aprobada.
- **Evidencia:** cronología sincronizada, resultados de ambas sesiones y correlación.
- **Detención:** si no se puede garantizar aislamiento o restauración.
- **Restauración:** restauración completa del ambiente y cierre de sesiones.

### `QA-F8-12` — Reversión o devolución posterior

- **Objetivo:** determinar si existe una operación posterior y cómo se relaciona con la entrega original.
- **Precondiciones:** proceso de devolución identificado y autorizado; entrega ficticia previa con evidencia.
- **Datos ficticios:** pedido procesado, partidas y documento de origen ficticios.
- **Línea base:** entrega original, inventario, documentos, estados y auditoría.
- **Acción futura:** el operador autorizado ejecutará el proceso de reversión o devolución definido, no se asumirá que sea F8.
- **Objetos a observar:** cabecera, detalle, inventario, documentos, relaciones y auditoría.
- **Resultado esperado:** pendiente hasta aprobar reglas de reversión y devolución.
- **Evidencia:** correlación con operación original, antes/después, mensajes y usuario.
- **Detención:** si no existe un proceso autorizado o se intenta modificar un sistema real.
- **Restauración:** restauración del ambiente aislado al punto inicial aprobado.

## 7. Paquete mínimo de evidencia

Cada ejecución futura deberá conservar:

- Identificador único del caso.
- Fecha, hora y zona horaria.
- Nombre y versión del ambiente utilizado.
- Confirmación de aislamiento de producción y SAP real.
- Usuario funcional y usuario técnico, anonimizados en copias compartidas.
- Roles y almacenes asignados.
- Identificador del pedido ficticio.
- Descripción de partidas y cantidades ficticias.
- Capturas antes y después.
- Captura de la selección inmediatamente anterior a la acción.
- Mensajes mostrados por SistemaOrigen.
- Resultados anonimizados de consultas `SELECT`.
- Lista de objetos y columnas observados.
- Identificadores de documentos, movimientos y correlación.
- Dependencias o comunicaciones externas observadas.
- Resultado de cada intento concurrente o repetido.
- Evidencia de auditoría de éxito y fallo.
- Registro de condiciones de detención activadas.
- Evidencia de restauración y verificación del ambiente.
- Firmas o aprobaciones de operador, proveedor del sistema heredado, DBA e integraciones cuando corresponda.

`IMG-F5-02`, `IMG-F5-03` e `IMG-F5-04` permanecerán como evidencia visual provisional hasta disponer de sus archivos binarios y verificar integridad, fecha y contenido.

## 8. Dependencias externas y bloqueos

### Dependencias externas

- Operador o supervisor de bodega para reglas operativas.
- Proveedor del sistema heredado para código y lógica heredada.
- DBA para objetos, transacciones, permisos y ambiente aislado.
- Responsable de SAP o integraciones para contratos y conciliación.
- Responsable de QA para datos ficticios, restauración y custodia de evidencia.
- Responsable de seguridad para identidades de mínimo privilegio.

### Bloqueos que Codex no puede resolver por sí solo

- Código fuente heredado no disponible.
- Binarios de tres capturas no disponibles.
- Ausencia de documentación funcional firmada.
- Imposibilidad de observar F8 sin autorización y ambiente QA.
- Efectos externos no visibles en dependencias SQL declaradas.
- Significado empresarial de estados y colores.
- Reglas de entrega parcial, devolución y reversión.
- Diseño real de idempotencia, concurrencia y conciliación.
- Matriz de permisos funcionales.
- Fuente autorizada de auditoría.
- Disponibilidad de una copia aislada y restaurable.

## 9. Decisiones modernas que deben conservarse

- El botón visible será la acción principal.
- F8 será únicamente un atajo opcional para abrir `Preparar entrega`.
- Existirá confirmación explícita antes de una futura escritura.
- Se diseñará preparación asistida por escaneo.
- Se diseñará una línea de tiempo auditable.
- Se diseñará un panel de preparación inteligente basado en reglas comprobables.
- Se contemplarán prevención de duplicados y control de concurrencia.
- Los estados se explicarán mediante texto y no solamente colores.
- Ninguno de estos componentes se implementa en esta fase.

## 10. Puertas recomendadas para una futura Fase 6

### Posible Fase 6A — Interfaz no transaccional

**Recomendación: `GO condicionado`, no autorizado.**

Existe evidencia suficiente para diseñar posteriormente una interfaz estrictamente no transaccional que:

- Use el botón visible `Preparar entrega` y atajos opcionales.
- Permita navegar desde un pedido consultado hacia una revisión de partidas.
- Muestre el panel, escaneo y línea de tiempo como estructura visual explícitamente no operativa.
- Mantenga la confirmación final deshabilitada.
- No cree endpoints de escritura.
- No afirme que una clasificación, cantidad pendiente o integración es definitiva.
- Explique que las reglas empresariales están pendientes.
- No simule una entrega exitosa ni genere un número de seguimiento ficticio presentado como real.

Antes de autorizarla debe definirse qué partes usarán datos reales de consulta y cuáles serán prototipos etiquetados. El `GO condicionado` es una recomendación, no autorización de implementación.

### Futura Fase 6B — Operación transaccional

**Recomendación: `NO-GO`.**

Los diez criterios críticos carecen de evidencia completa. La Fase 6B permanecerá bloqueada mientras cualquiera de ellos esté `Pendiente`, `Parcialmente demostrado` o `Bloqueado por fuente externa`.

## 11. Criterios de actualización de la matriz

Un criterio solo podrá pasar a `Confirmado` cuando:

1. La fuente responsable entregue evidencia verificable.
2. La evidencia identifique ambiente, fecha, versión y alcance.
3. No dependa únicamente del nombre de un objeto.
4. La evidencia estática y la observación QA no se contradigan.
5. Se documenten excepciones y errores.
6. El responsable empresarial o técnico correspondiente apruebe la interpretación.

Si las fuentes discrepan, el estado será `Pendiente` o `Bloqueado por fuente externa`, nunca `Confirmado`.

## 12. Decisión final

- `GO conceptual`: continuar investigación, solicitar evidencia y preparar una futura validación controlada.
- Fase 6A: `GO condicionado` como recomendación exclusivamente no transaccional; no autorizada.
- Fase 6B: `NO-GO` para cualquier operación de escritura.
- Fase 5 completa: no cerrada.

No debe avanzarse a otra fase ni ejecutarse una entrega sin autorización expresa.
