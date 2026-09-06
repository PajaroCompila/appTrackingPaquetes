# Roles y permisos

Estas reglas son obligatorias en todas las pantallas, menús, rutas y operaciones de `appTrackingPaquetes`.

## Usuario

- Puede consultar trackings.
- Puede crear sus propias gestiones y envíos.
- Puede consultar únicamente sus propias gestiones.
- No puede consultar ni modificar gestiones de otros usuarios.
- No puede administrar cuentas ni roles.

## Supervisor

- Conserva las funciones operativas de un usuario.
- Puede consultar y gestionar las operaciones de los usuarios normales.
- Puede crear cuentas con rol de usuario.
- Puede modificar datos de usuarios normales.
- Puede desactivar usuarios normales.
- Puede restablecer contraseñas de usuarios normales.
- No puede crear, modificar, desactivar ni eliminar supervisores.
- No puede cambiar la contraseña ni el rol de otro supervisor.
- No puede administrar cuentas con rol de administrador.

## Administrador

- Puede administrar usuarios normales y supervisores.
- Puede crear, modificar y desactivar supervisores.
- Puede restablecer contraseñas de usuarios y supervisores.
- Puede crear y modificar cuentas con rol de administrador.
- Puede eliminar o desactivar otros administradores, respetando las protecciones de seguridad.
- Puede consultar y gestionar todas las operaciones del sistema.

## Protecciones obligatorias

- Nadie puede modificar su propio rol.
- Un administrador no puede eliminarse ni desactivarse a sí mismo.
- Nunca se puede eliminar o desactivar al último administrador activo.
- Las cuentas operativas deben desactivarse en lugar de borrarse definitivamente cuando tengan historial.
- Las contraseñas existentes nunca se muestran ni se recuperan.
- Al restablecer una contraseña se debe asignar una temporal y solicitar su cambio en el siguiente inicio de sesión.
- Toda acción administrativa debe registrar quién la realizó, cuándo la realizó y qué cuenta fue afectada.
- Las gestiones conservan la referencia del usuario que las creó aunque su cuenta sea desactivada.
- Los permisos se validan obligatoriamente en el backend. La visibilidad de botones en Angular es solo una medida de experiencia de usuario.

## Aplicación en las pantallas

- Cada pantalla debe mostrar únicamente acciones permitidas para el rol autenticado.
- Las rutas no autorizadas deben bloquearse aunque el usuario escriba directamente la dirección.
- Los listados deben limitar la información según el alcance del rol.
- Los formularios deben impedir asignar roles superiores al rol que realiza la operación.
- La interfaz y el backend deben aplicar exactamente la misma matriz de permisos.
