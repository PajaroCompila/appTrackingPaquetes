import argon2 from "argon2";
import type {
  ActualizacionUsuario,
  IdentidadAutenticada,
  RegistroUsuario,
  Rol,
  UsuarioGuardado,
  UsuarioPublico,
} from "../modelos/usuario.js";
import type { RepositorioUsuarios } from "../repositorios/usuarios.repositorio.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
import { generarContrasenaTemporal } from "../utilidades/contrasenaTemporal.js";
import {
  normalizarCorreo,
  normalizarNombreUsuario,
  normalizarTexto,
} from "../utilidades/normalizar.js";

const hacerPublico = (usuario: UsuarioGuardado): UsuarioPublico => ({
  sucursalId: usuario.sucursalId,
  nombreSucursal: usuario.nombreSucursal,
  usuarioId: usuario.usuarioId,
  nombres: usuario.nombres,
  apellidos: usuario.apellidos,
  nombreUsuario: usuario.nombreUsuario,
  correoElectronico: usuario.correoElectronico,
  rol: usuario.rol,
  activo: usuario.activo,
  debeCambiarContrasena: usuario.debeCambiarContrasena,
  fechaCreacion: usuario.fechaCreacion,
});

export class ServicioUsuarios {
  constructor(private readonly repositorio: RepositorioUsuarios) {}

  async obtenerIdentidadActual(identidad: IdentidadAutenticada): Promise<IdentidadAutenticada> {
    const usuario = await this.repositorio.buscarPorNombreUsuario(identidad.nombreUsuario);
    if (!usuario || !usuario.activo)
      throw new ErrorAplicacion(401, "SESION_INVALIDA", "La sesión no es válida");
    return {
      usuarioId: usuario.usuarioId,
      nombreUsuario: usuario.nombreUsuario,
      nombreCompleto: `${usuario.nombres} ${usuario.apellidos}`.trim(),
      rol: usuario.rol,
      sucursalId: usuario.sucursalId,
    };
  }

  async listar(identidad: IdentidadAutenticada): Promise<UsuarioPublico[]> {
    if (identidad.rol === "usuario")
      throw new ErrorAplicacion(
        403,
        "ACCESO_DENEGADO",
        "No tienes permiso para consultar usuarios",
      );
    const usuarios = await this.repositorio.listar();
    return usuarios
      .filter(
        (usuario) =>
          identidad.rol === "administrador" || usuario.rol === "usuario",
      )
      .map(hacerPublico);
  }

  private validarRolAsignable(rolCreador: Rol, rolNuevo: Rol): void {
    if (rolCreador === "usuario")
      throw new ErrorAplicacion(
        403,
        "ACCESO_DENEGADO",
        "No tienes permiso para crear usuarios",
      );
    if (rolCreador === "supervisor" && rolNuevo !== "usuario")
      throw new ErrorAplicacion(
        403,
        "ROL_NO_PERMITIDO",
        "No tienes permiso para asignar ese rol",
      );
  }

  private async comprobarUnicidad(
    nombreUsuario: string,
    correoElectronico: string,
    usuarioIdActual?: number,
  ): Promise<void> {
    const usuarioConNombre =
      await this.repositorio.buscarPorNombreUsuario(nombreUsuario);
    if (usuarioConNombre && usuarioConNombre.usuarioId !== usuarioIdActual)
      throw new ErrorAplicacion(
        409,
        "USUARIO_DUPLICADO",
        "El nombre de usuario ya está registrado",
      );
    const usuarioConCorreo =
      await this.repositorio.buscarPorCorreo(correoElectronico);
    if (usuarioConCorreo && usuarioConCorreo.usuarioId !== usuarioIdActual)
      throw new ErrorAplicacion(
        409,
        "CORREO_DUPLICADO",
        "El correo electrónico ya está registrado",
      );
  }
  private async comprobarSucursal(sucursalId: number) { if (!(await this.repositorio.existeSucursalActiva(sucursalId))) throw new ErrorAplicacion(400,"SUCURSAL_INVALIDA","Selecciona una sucursal activa"); }

  async iniciarSesion(
    nombreUsuarioRecibido: string,
    contrasena: string,
  ): Promise<IdentidadAutenticada> {
    const nombreUsuario = normalizarNombreUsuario(nombreUsuarioRecibido);
    const usuario =
      await this.repositorio.buscarPorNombreUsuario(nombreUsuario);
    if (
      !usuario ||
      !usuario.activo ||
      !(await argon2.verify(usuario.contrasenaHash, contrasena))
    )
      throw new ErrorAplicacion(
        401,
        "CREDENCIALES_INVALIDAS",
        "El usuario o la contraseña no son correctos",
      );
    return {
      usuarioId: usuario.usuarioId,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol,
      sucursalId: usuario.sucursalId,
      nombreCompleto: `${usuario.nombres} ${usuario.apellidos}`.trim(),
    };
  }

  async crear(identidad: IdentidadAutenticada, registro: RegistroUsuario) {
    this.validarRolAsignable(identidad.rol, registro.rol);
    const nombreUsuario = normalizarNombreUsuario(registro.nombreUsuario);
    const correoElectronico = normalizarCorreo(registro.correoElectronico);
    await this.comprobarUnicidad(nombreUsuario, correoElectronico);
    await this.comprobarSucursal(registro.sucursalId);
    const contrasenaTemporal = generarContrasenaTemporal();
    const contrasenaHash = await argon2.hash(contrasenaTemporal, {
      type: argon2.argon2id,
    });
    const guardado = await this.repositorio.crear({
      nombres: normalizarTexto(registro.nombres),
      sucursalId: registro.sucursalId,
      apellidos: normalizarTexto(registro.apellidos),
      nombreUsuario,
      correoElectronico,
      rol: registro.rol,
      contrasenaHash,
    });
    return { usuario: hacerPublico(guardado), contrasenaTemporal };
  }

  async actualizar(
    identidad: IdentidadAutenticada,
    usuarioId: number,
    cambios: ActualizacionUsuario,
  ) {
    const usuarioActual = (await this.repositorio.listar()).find(
      (usuario) => usuario.usuarioId === usuarioId,
    );
    if (!usuarioActual)
      throw new ErrorAplicacion(
        404,
        "USUARIO_NO_ENCONTRADO",
        "El usuario no existe",
      );
    if (
      identidad.rol === "usuario" ||
      (identidad.rol === "supervisor" && usuarioActual.rol !== "usuario")
    )
      throw new ErrorAplicacion(
        403,
        "ACCESO_DENEGADO",
        "No tienes permiso para editar este usuario",
      );
    this.validarRolAsignable(identidad.rol, cambios.rol);
    const nombreUsuario = normalizarNombreUsuario(cambios.nombreUsuario);
    const correoElectronico = normalizarCorreo(cambios.correoElectronico);
    await this.comprobarUnicidad(nombreUsuario, correoElectronico, usuarioId);
    await this.comprobarSucursal(cambios.sucursalId);
    const contrasenaTemporal = cambios.restablecerContrasena
      ? generarContrasenaTemporal()
      : undefined;
    const contrasenaHash = contrasenaTemporal
      ? await argon2.hash(contrasenaTemporal, { type: argon2.argon2id })
      : undefined;
    const actualizado = await this.repositorio.actualizar(usuarioId, {
      nombres: normalizarTexto(cambios.nombres),
      sucursalId: cambios.sucursalId,
      apellidos: normalizarTexto(cambios.apellidos),
      nombreUsuario,
      correoElectronico,
      rol: cambios.rol,
      activo: cambios.activo,
      contrasenaHash,
    });
    if (!actualizado)
      throw new ErrorAplicacion(
        404,
        "USUARIO_NO_ENCONTRADO",
        "El usuario no existe",
      );
    return { usuario: hacerPublico(actualizado), contrasenaTemporal };
  }

  async inicializarAdministrador(
    registro: Omit<RegistroUsuario, "rol" | "sucursalId"> & { contrasena: string },
  ): Promise<void> {
    if (await this.repositorio.existeAdministradorActivo())
      throw new ErrorAplicacion(
        409,
        "ADMIN_EXISTENTE",
        "Ya existe un Administrador activo",
      );
    const nombreUsuario = normalizarNombreUsuario(registro.nombreUsuario);
    const correoElectronico = normalizarCorreo(registro.correoElectronico);
    await this.comprobarUnicidad(nombreUsuario, correoElectronico);
    const contrasenaHash = await argon2.hash(registro.contrasena, {
      type: argon2.argon2id,
    });
    await this.repositorio.crear({
      sucursalId: await this.repositorio.obtenerSucursalPrincipal(),
      nombres: normalizarTexto(registro.nombres),
      apellidos: normalizarTexto(registro.apellidos),
      nombreUsuario,
      correoElectronico,
      rol: "administrador",
      contrasenaHash,
    });
  }
}
