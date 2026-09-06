import { cerrarConexion } from "../baseDatos/conexion.js";
import {
  cargarAdministradorInicial,
  cargarConfiguracion,
} from "../configuracion/entorno.js";
import { RepositorioUsuariosSql } from "../repositorios/usuarios.repositorio.js";
import { ServicioUsuarios } from "../servicios/usuarios.servicio.js";

async function ejecutar(): Promise<void> {
  try {
    const configuracion = cargarConfiguracion();
    const administrador = cargarAdministradorInicial();
    const servicio = new ServicioUsuarios(
      new RepositorioUsuariosSql(configuracion),
    );
    await servicio.inicializarAdministrador(administrador);
    console.log("Administrador inicial creado correctamente.");
  } catch {
    console.error(
      "No fue posible crear el Administrador inicial. Revisa la configuración y los conflictos existentes.",
    );
    process.exitCode = 1;
  } finally {
    await cerrarConexion();
  }
}

void ejecutar();
