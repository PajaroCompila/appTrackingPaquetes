import type { IdentidadAutenticada } from "./usuario.js";
declare global {
  namespace Express {
    interface Request {
      identidad?: IdentidadAutenticada;
    }
  }
}
export {};
