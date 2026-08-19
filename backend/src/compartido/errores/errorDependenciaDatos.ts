export class ErrorDependenciaDatos extends Error {
  public constructor() {
    super('La dependencia de datos no está disponible.');
    this.name = 'ErrorDependenciaDatos';
  }
}

