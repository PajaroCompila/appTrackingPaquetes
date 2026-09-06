import argon2 from "argon2";
import { beforeEach, describe, expect, it } from "vitest";
import type { IdentidadAutenticada } from "../modelos/usuario.js";
import { RepositorioUsuariosMemoria } from "../pruebas/repositorioUsuariosMemoria.js";
import { ServicioUsuarios } from "./usuarios.servicio.js";

const usuario: IdentidadAutenticada = {
  sucursalId: 1,
  usuarioId: 1,
  nombreUsuario: "operador",
  rol: "usuario",
};
const supervisor: IdentidadAutenticada = {
  sucursalId: 1,
  usuarioId: 2,
  nombreUsuario: "supervisor",
  rol: "supervisor",
};
const administrador: IdentidadAutenticada = {
  sucursalId: 1,
  usuarioId: 3,
  nombreUsuario: "administrador",
  rol: "administrador",
};
const registro = {
  sucursalId: 1,
  nombres: "Ana María",
  apellidos: "López Ruiz",
  nombreUsuario: "ana.lopez",
  correoElectronico: "ana@example.test",
  rol: "usuario" as const,
};

describe("ServicioUsuarios: autorización y creación", () => {
  let repositorio: RepositorioUsuariosMemoria;
  let servicio: ServicioUsuarios;
  beforeEach(() => {
    repositorio = new RepositorioUsuariosMemoria();
    servicio = new ServicioUsuarios(repositorio);
  });

  it("impide que un Usuario cree cuentas", async () => {
    await expect(servicio.crear(usuario, registro)).rejects.toMatchObject({
      codigo: "ACCESO_DENEGADO",
    });
  });
  it("permite que un Supervisor cree un Usuario", async () => {
    await expect(servicio.crear(supervisor, registro)).resolves.toHaveProperty(
      "usuario.rol",
      "usuario",
    );
  });
  it("impide que un Supervisor cree otro Supervisor", async () => {
    await expect(
      servicio.crear(supervisor, { ...registro, rol: "supervisor" }),
    ).rejects.toMatchObject({ codigo: "ROL_NO_PERMITIDO" });
  });
  it("impide que un Supervisor cree un Administrador", async () => {
    await expect(
      servicio.crear(supervisor, { ...registro, rol: "administrador" }),
    ).rejects.toMatchObject({ codigo: "ROL_NO_PERMITIDO" });
  });
  it.each(["usuario", "supervisor", "administrador"] as const)(
    "permite que un Administrador cree el rol %s",
    async (rol) => {
      await expect(
        servicio.crear(administrador, { ...registro, rol }),
      ).resolves.toHaveProperty("usuario.rol", rol);
    },
  );
  it("rechaza un nombre de usuario duplicado", async () => {
    await servicio.crear(administrador, registro);
    await expect(
      servicio.crear(administrador, {
        ...registro,
        correoElectronico: "otro@example.test",
      }),
    ).rejects.toMatchObject({ codigo: "USUARIO_DUPLICADO" });
  });
  it("rechaza un correo electrónico duplicado", async () => {
    await servicio.crear(administrador, registro);
    await expect(
      servicio.crear(administrador, {
        ...registro,
        nombreUsuario: "otro.usuario",
      }),
    ).rejects.toMatchObject({ codigo: "CORREO_DUPLICADO" });
  });
  it("no devuelve el hash y separa la contraseña temporal", async () => {
    const resultado = await servicio.crear(administrador, registro);
    expect(resultado.usuario).not.toHaveProperty("contrasenaHash");
    expect(resultado.usuario).not.toHaveProperty("contrasenaTemporal");
    expect(resultado.contrasenaTemporal).toBe("Pajaroazul1");
    expect(repositorio.usuarios[0]?.contrasenaHash).not.toBe(
      resultado.contrasenaTemporal,
    );
  });
});

describe("ServicioUsuarios: edición", () => {
  it("restablece la contraseña como temporal", async () => {
    const repositorio = new RepositorioUsuariosMemoria();
    const servicio = new ServicioUsuarios(repositorio);
    const creado = await servicio.crear(administrador, registro);
    const resultado = await servicio.actualizar(
      administrador,
      creado.usuario.usuarioId,
      {
        ...registro,
        activo: true,
        restablecerContrasena: true,
      },
    );
    expect(resultado.contrasenaTemporal).toBe("Pajaroazul1");
    expect(repositorio.usuarios[0]?.debeCambiarContrasena).toBe(true);
    expect(
      await argon2.verify(
        repositorio.usuarios[0]!.contrasenaHash,
        "Pajaroazul1",
      ),
    ).toBe(true);
  });

  it("impide que un supervisor edite a otro supervisor", async () => {
    const repositorio = new RepositorioUsuariosMemoria();
    const servicio = new ServicioUsuarios(repositorio);
    const creado = await servicio.crear(administrador, {
      ...registro,
      rol: "supervisor",
    });
    await expect(
      servicio.actualizar(supervisor, creado.usuario.usuarioId, {
        ...registro,
        rol: "supervisor",
        activo: true,
        restablecerContrasena: false,
      }),
    ).rejects.toMatchObject({ codigo: "ACCESO_DENEGADO" });
  });
});

describe("ServicioUsuarios: inicio de sesión", () => {
  it("devuelve la identidad de una cuenta activa", async () => {
    const repositorio = new RepositorioUsuariosMemoria();
    repositorio.usuarios.push({
      ...registro,
      usuarioId: 7,
      activo: true,
      debeCambiarContrasena: false,
      fechaCreacion: new Date(),
      contrasenaHash: await argon2.hash("Correcta-123!"),
    });
    await expect(
      new ServicioUsuarios(repositorio).iniciarSesion(
        "  ANA.LOPEZ  ",
        "Correcta-123!",
      ),
    ).resolves.toEqual({
      usuarioId: 7,
      nombreUsuario: "ana.lopez",
      rol: "usuario",
      sucursalId: 1,
      nombreCompleto: "Ana María López Ruiz",
    });
  });

  it("rechaza una cuenta inactiva", async () => {
    const repositorio = new RepositorioUsuariosMemoria();
    repositorio.usuarios.push({
      ...registro,
      usuarioId: 1,
      activo: false,
      debeCambiarContrasena: true,
      fechaCreacion: new Date(),
      contrasenaHash: await argon2.hash("Correcta-123!"),
    });
    await expect(
      new ServicioUsuarios(repositorio).iniciarSesion(
        "ana.lopez",
        "Correcta-123!",
      ),
    ).rejects.toMatchObject({ codigo: "CREDENCIALES_INVALIDAS" });
  });
  it("rechaza credenciales incorrectas", async () => {
    const repositorio = new RepositorioUsuariosMemoria();
    repositorio.usuarios.push({
      ...registro,
      usuarioId: 1,
      activo: true,
      debeCambiarContrasena: true,
      fechaCreacion: new Date(),
      contrasenaHash: await argon2.hash("Correcta-123!"),
    });
    await expect(
      new ServicioUsuarios(repositorio).iniciarSesion(
        "ana.lopez",
        "Incorrecta",
      ),
    ).rejects.toMatchObject({ codigo: "CREDENCIALES_INVALIDAS" });
  });
});
