import { ControlOperativoRepositorio } from './controlOperativoRepositorio.js';
import { ControlOperativoFinanciero } from './controlOperativoFinanciero.js';

export class ControlOperativoSincronizador {
  private enCurso=false;
  public constructor(private readonly repo=new ControlOperativoRepositorio(),
    private readonly financiero=new ControlOperativoFinanciero()) {}
  public async sincronizar(): Promise<void> {
    if (this.enCurso) return;
    this.enCurso=true;
    try {
      if (!await this.repo.disponible()) return;
      const candidatos=await this.repo.candidatosFinancieros();
      await this.repo.guardarEstados(await this.financiero.estados(candidatos.map(c=>c.idOrigen)));
    } finally {this.enCurso=false;}
  }
}
