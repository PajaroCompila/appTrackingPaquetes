import { Router } from 'express';
import { obtenerConfiguracionAutenticacion } from '../../configuracion/configuracion.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { nombreCookieSesion, opcionesCookieSesion, requerirAutenticacion } from './autenticacionMiddleware.js';
import { AutenticacionServicio } from './autenticacionServicio.js';
import { esquemaCambioContrasena, esquemaInicioSesion } from './autenticacionValidacion.js';

export const autenticacionRutas = Router();
const servicio = new AutenticacionServicio();

autenticacionRutas.post('/iniciar-sesion', async (solicitud, respuesta, siguiente) => {
  try {
    const validacion = esquemaInicioSesion.safeParse(solicitud.body);
    if (!validacion.success) {
      throw new ErrorAplicacion(400, 'DATOS_ACCESO_INVALIDOS', 'Los datos de acceso no son vÃ¡lidos.');
    }
    const sesion = await servicio.iniciarSesion(validacion.data.nombreUsuario, validacion.data.contrasena);
    respuesta.cookie(nombreCookieSesion, sesion.token, opcionesCookieSesion(sesion.duracionMs));
    const { sesionId: _sesionId, ...usuario } = sesion.identidad;
    void _sesionId;
    respuesta.json({ usuario });
  } catch (error) { siguiente(error); }
});

autenticacionRutas.get('/sesion', requerirAutenticacion, (solicitud, respuesta) => {
  const { sesionId: _sesionId, ...usuario } = solicitud.user!;
  void _sesionId;
  respuesta.json({ usuario });
});

autenticacionRutas.post('/cerrar-sesion', requerirAutenticacion, async (solicitud, respuesta, siguiente) => {
  try {
    await servicio.cerrarSesion(solicitud.user!.sesionId);
    const autenticacion = obtenerConfiguracionAutenticacion();
    respuesta.clearCookie(nombreCookieSesion, opcionesCookieSesion(autenticacion.duracionMinutos * 60_000));
    respuesta.status(204).send();
  } catch (error) { siguiente(error); }
});

autenticacionRutas.post('/cambiar-contrasena', requerirAutenticacion, async (solicitud, respuesta, siguiente) => {
  try {
    const datos = esquemaCambioContrasena.parse(solicitud.body);
    await servicio.cambiarContrasena(solicitud.user!, datos.contrasenaActual, datos.nuevaContrasena);
    respuesta.status(204).send();
  } catch (error) { siguiente(error); }
});
