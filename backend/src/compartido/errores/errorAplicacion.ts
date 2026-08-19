export class ErrorAplicacion extends Error {
  public constructor(
    public readonly estadoHttp: number,
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAplicacion';
  }
}

