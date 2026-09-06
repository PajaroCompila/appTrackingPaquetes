import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
export const manejarErrores: ErrorRequestHandler = (
  error: unknown,
  _solicitud,
  respuesta,
  _siguiente,
) => {
  if (error instanceof ZodError) {
    respuesta
      .status(400)
      .json({
        codigo: "DATOS_INVALIDOS",
        mensaje: error.issues[0]?.message ?? "Revisa los datos ingresados",
      });
    return;
  }
  if (error instanceof ErrorAplicacion) {
    respuesta
      .status(error.estado)
      .json({ codigo: error.codigo, mensaje: error.message });
    return;
  }
  respuesta
    .status(500)
    .json({
      codigo: "ERROR_INTERNO",
      mensaje: "No fue posible completar la solicitud",
    });
};
