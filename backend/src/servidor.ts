import { crearAplicacion } from "./aplicacion.js";
import { cargarConfiguracion } from "./configuracion/entorno.js";
import { RepositorioUsuariosSql } from "./repositorios/usuarios.repositorio.js";
import { RepositorioSucursalesSql } from "./repositorios/sucursales.repositorio.js";
import { RepositorioEnviosSql } from "./repositorios/envios.repositorio.js";

const configuracion = cargarConfiguracion();
const repositorio = new RepositorioUsuariosSql(configuracion);
const repositorioSucursales = new RepositorioSucursalesSql(configuracion);
const repositorioEnvios = new RepositorioEnviosSql(configuracion);
const aplicacion = crearAplicacion(configuracion, repositorio, repositorioSucursales, repositorioEnvios);

aplicacion.listen(configuracion.puerto, () => {
  console.log(`API disponible en el puerto ${configuracion.puerto}`);
});
