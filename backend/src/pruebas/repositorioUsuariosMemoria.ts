import type {
  CambiosUsuario,
  NuevoUsuario,
  UsuarioGuardado,
} from "../modelos/usuario.js";
import type { RepositorioUsuarios } from "../repositorios/usuarios.repositorio.js";

export class RepositorioUsuariosMemoria implements RepositorioUsuarios {
  usuarios: UsuarioGuardado[] = [];
  listar() {
    return Promise.resolve([...this.usuarios].reverse());
  }
  buscarPorNombreUsuario(nombreUsuario: string) {
    return Promise.resolve(
      this.usuarios.find(
        (usuario) => usuario.nombreUsuario === nombreUsuario,
      ) ?? null,
    );
  }
  buscarPorCorreo(correoElectronico: string) {
    return Promise.resolve(
      this.usuarios.find(
        (usuario) => usuario.correoElectronico === correoElectronico,
      ) ?? null,
    );
  }
  existeAdministradorActivo() {
    return Promise.resolve(
      this.usuarios.some(
        (usuario) => usuario.rol === "administrador" && usuario.activo,
      ),
    );
  }
  existeSucursalActiva(sucursalId: number) { return Promise.resolve(sucursalId > 0); }
  obtenerSucursalPrincipal() { return Promise.resolve(1); }
  crear(nuevo: NuevoUsuario) {
    const usuario: UsuarioGuardado = {
      ...nuevo,
      nombreSucursal: 'Sucursal de prueba',
      usuarioId: this.usuarios.length + 1,
      activo: true,
      debeCambiarContrasena: true,
      fechaCreacion: new Date("2026-08-15T00:00:00Z"),
    };
    this.usuarios.push(usuario);
    return Promise.resolve(usuario);
  }
  actualizar(usuarioId: number, cambios: CambiosUsuario) {
    const indice = this.usuarios.findIndex(
      (usuario) => usuario.usuarioId === usuarioId,
    );
    const actual = this.usuarios[indice];
    if (!actual) return Promise.resolve(null);
    const actualizado: UsuarioGuardado = {
      ...actual,
      ...cambios,
      contrasenaHash: cambios.contrasenaHash ?? actual.contrasenaHash,
      debeCambiarContrasena: cambios.contrasenaHash
        ? true
        : actual.debeCambiarContrasena,
    };
    this.usuarios[indice] = actualizado;
    return Promise.resolve(actualizado);
  }
}
