export class ErrorAplicacion extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorAplicacion";
  }
}
