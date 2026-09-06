import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import type { Configuracion } from "./configuracion/entorno.js";
import { ControladorAutenticacion } from "./controladores/autenticacion.controlador.js";
import { ControladorUsuarios } from "./controladores/usuarios.controlador.js";
import { ControladorSucursales } from "./controladores/sucursales.controlador.js";
import { ControladorEnvios } from "./controladores/envios.controlador.js";
import { autenticar, exigirOrigen } from "./middlewares/autenticacion.js";
import { manejarErrores } from "./middlewares/errores.js";
import type { RepositorioUsuarios } from "./repositorios/usuarios.repositorio.js";
import type { RepositorioSucursales } from "./repositorios/sucursales.repositorio.js";
import type { RepositorioEnvios } from "./repositorios/envios.repositorio.js";
import { ServicioSesion } from "./servicios/sesion.servicio.js";
import { ServicioUsuarios } from "./servicios/usuarios.servicio.js";
import { ServicioSucursales } from "./servicios/sucursales.servicio.js";
import { ServicioEnvios } from "./servicios/envios.servicio.js";

export function crearAplicacion(
  configuracion: Configuracion,
  repositorio: RepositorioUsuarios,
  repositorioSucursales?: RepositorioSucursales,
  repositorioEnvios?: RepositorioEnvios,
): Express {
  const aplicacion = express();
  const usuarios = new ServicioUsuarios(repositorio);
  const sesion = new ServicioSesion(
    configuracion.tokenSecreto,
    configuracion.tokenDuracion,
  );
  const autenticacion = new ControladorAutenticacion(
    usuarios,
    sesion,
    configuracion,
  );
  const controladorUsuarios = new ControladorUsuarios(usuarios);
  const sucursales = repositorioSucursales
    ? new ServicioSucursales(repositorioSucursales)
    : null;
  const controladorSucursales = sucursales
    ? new ControladorSucursales(sucursales)
    : null;
  const envios = repositorioEnvios
    ? new ServicioEnvios(repositorioEnvios)
    : null;
  const controladorEnvios = envios ? new ControladorEnvios(envios) : null;
  const requiereSesion = autenticar(sesion);

  aplicacion.disable("x-powered-by");
  aplicacion.use(
    cors({
      origin: configuracion.origenFrontend,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    }),
  );
  aplicacion.use(express.json({ limit: "20kb" }));
  aplicacion.use(cookieParser());
  aplicacion.use(exigirOrigen(configuracion.origenFrontend));

  aplicacion.post("/api/sesion/iniciar", autenticacion.iniciar);
  aplicacion.get("/api/sesion/actual", requiereSesion, autenticacion.actual);
  aplicacion.post("/api/sesion/cerrar", requiereSesion, autenticacion.cerrar);
  aplicacion.post("/api/usuarios", requiereSesion, controladorUsuarios.crear);
  aplicacion.get("/api/usuarios", requiereSesion, controladorUsuarios.listar);
  aplicacion.patch(
    "/api/usuarios/:usuarioId",
    requiereSesion,
    controladorUsuarios.actualizar,
  );
  if (controladorSucursales) {
    aplicacion.get(
      "/api/ubicaciones",
      requiereSesion,
      controladorSucursales.listarUbicaciones,
    );
    aplicacion.get(
      "/api/sucursales",
      requiereSesion,
      controladorSucursales.listar,
    );
    aplicacion.post(
      "/api/sucursales",
      requiereSesion,
      controladorSucursales.crear,
    );
    aplicacion.patch(
      "/api/sucursales/:sucursalId",
      requiereSesion,
      controladorSucursales.actualizar,
    );
  }
  if (controladorEnvios) {
    aplicacion.get("/api/envios/guia/:numeroGuia", controladorEnvios.consultar);
    aplicacion.get("/api/envios", requiereSesion, controladorEnvios.listar);
    aplicacion.post("/api/envios", requiereSesion, controladorEnvios.crear);
    aplicacion.patch("/api/envios/:envioId", requiereSesion, controladorEnvios.actualizar);
    aplicacion.delete("/api/envios/:envioId", requiereSesion, controladorEnvios.eliminar);
    aplicacion.get("/api/recepciones", requiereSesion, controladorEnvios.listarRecepciones);
    aplicacion.get("/api/recepciones/usuarios", requiereSesion, controladorEnvios.usuariosActivos);
    aplicacion.post("/api/recepciones", requiereSesion, controladorEnvios.registrarRecepcion);
    aplicacion.post("/api/recepciones/lote", requiereSesion, controladorEnvios.registrarRecepciones);
  }
  aplicacion.use(manejarErrores);
  return aplicacion;
}
