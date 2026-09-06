import request from "supertest";
import { describe, expect, it } from "vitest";
import { crearAplicacion } from "./aplicacion.js";
import type { Configuracion } from "./configuracion/entorno.js";
import { RepositorioUsuariosMemoria } from "./pruebas/repositorioUsuariosMemoria.js";

const configuracion: Configuracion = {
  puerto: 3000,
  origenFrontend: "http://localhost:4200",
  tokenSecreto: "x".repeat(48),
  tokenDuracion: "1h",
  produccion: false,
  sql: {
    server: "no-utilizado",
    port: 1433,
    database: "pruebas",
    user: "pruebas",
    password: "x",
    options: { encrypt: false, trustServerCertificate: true },
    pool: { min: 0, max: 1, idleTimeoutMillis: 1000 },
  },
};

describe("Protección del endpoint de usuarios", () => {
  it("rechaza una solicitud sin token", async () => {
    const respuesta = await request(
      crearAplicacion(configuracion, new RepositorioUsuariosMemoria()),
    )
      .post("/api/usuarios")
      .set("Origin", configuracion.origenFrontend)
      .send({});
    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toMatchObject({ codigo: "SESION_REQUERIDA" });
  });
  it("rechaza una solicitud con token inválido", async () => {
    const respuesta = await request(
      crearAplicacion(configuracion, new RepositorioUsuariosMemoria()),
    )
      .post("/api/usuarios")
      .set("Origin", configuracion.origenFrontend)
      .set("Cookie", "sesionTracking=token-invalido")
      .send({});
    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toMatchObject({ codigo: "SESION_INVALIDA" });
  });
});
