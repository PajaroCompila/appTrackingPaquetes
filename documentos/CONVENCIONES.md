# Convenciones de appTrackingPaquetes

- Las variables se escribirán en español y con `camelCase`.
- Los nombres serán cortos, claros, naturales y específicos.
- Se evitarán nombres genéricos como `data`, `item`, `obj`, `entity` y `manager` cuando exista un nombre específico.
- Las tablas SQL tendrán nombres fáciles de entender.
- Las columnas SQL se escribirán en español y con `camelCase`.
- El backend utilizará Node.js, Express y TypeScript.
- El frontend utilizará Angular, TypeScript y PrimeNG.
- SQL Server se ejecutará mediante Docker.
- Se priorizará el código mantenible y sencillo sobre abstracciones innecesarias.
- Todas las pantallas deben mostrar el pie global: `Todos los derechos reservados ©Almacén Pájaro Azul 2026.`
- El pie global siempre debe incluir el logotipo del pájaro junto al texto legal.
- El pie de página debe implementarse en el contenedor global de la aplicación y no duplicarse en cada pantalla.
- Todas las pantallas, rutas, menús y operaciones deben respetar la jerarquía definida en `ROLES_Y_PERMISOS.md`.
- Los permisos se deben validar tanto en Angular como obligatoriamente en el backend.

## Ejemplos recomendados

- `numeroGuia`
- `codigoSeguimiento`
- `puntoOrigenId`
- `puntoDestinoId`
- `usuarioQueRegistraId`
- `fechaRecepcion`
- `estadoActual`
- `cantidadPaquetes`

## Nombres que deben evitarse

- `data`
- `entity`
- `obj`
- `genericData`
- `trackingEntity`
- `processManager`
- `itemObject`
