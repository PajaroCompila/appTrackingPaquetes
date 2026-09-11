import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';

type VentanaConAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

@Injectable({ providedIn: 'root' })
export class SonidoNotificacionService {
  private readonly documento = inject(DOCUMENT);
  private readonly destruirRef = inject(DestroyRef);
  private contexto: AudioContext | null = null;
  private audioPreparado = false;
  private preparacionEnCurso: Promise<boolean> | null = null;
  private reproduccionPendiente = false;
  private readonly prepararDesdeInteraccion = () => { void this.preparar(); };

  public constructor() {
    this.escucharInteraccionParaPreparar();
    this.destruirRef.onDestroy(() => {
      this.dejarDeEscucharInteraccion();
      void this.contexto?.close().catch(() => undefined);
    });
  }

  public reproducir(): void {
    const contexto = this.contexto;
    if (this.audioPreparado && contexto?.state === 'running') {
      this.emitirSonido(contexto);
      return;
    }
    if (this.reproduccionPendiente) return;
    this.reproduccionPendiente = true;
    void this.preparar().then((preparado) => {
      if (preparado && this.contexto) this.emitirSonido(this.contexto);
    }).finally(() => { this.reproduccionPendiente = false; });
  }

  private emitirSonido(contexto: AudioContext): void {
    try {
      const inicio = contexto.currentTime;
      const volumen = contexto.createGain();
      volumen.gain.setValueAtTime(0.0001, inicio);
      volumen.gain.exponentialRampToValueAtTime(0.13, inicio + 0.025);
      volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.48);
      volumen.connect(contexto.destination);

      const tonoPrincipal = contexto.createOscillator();
      tonoPrincipal.type = 'sine';
      tonoPrincipal.frequency.setValueAtTime(880, inicio);
      tonoPrincipal.frequency.setValueAtTime(1174.66, inicio + 0.16);
      tonoPrincipal.connect(volumen);
      tonoPrincipal.start(inicio);
      tonoPrincipal.stop(inicio + 0.5);

      const armonico = contexto.createOscillator();
      armonico.type = 'sine';
      armonico.frequency.setValueAtTime(1318.51, inicio + 0.16);
      armonico.connect(volumen);
      armonico.start(inicio + 0.16);
      armonico.stop(inicio + 0.46);
    } catch {
      // El aviso visual continúa disponible si el navegador rechaza el audio.
    }
  }

  private escucharInteraccionParaPreparar(): void {
    this.documento.addEventListener('pointerdown', this.prepararDesdeInteraccion);
    this.documento.addEventListener('keydown', this.prepararDesdeInteraccion);
  }

  private dejarDeEscucharInteraccion(): void {
    this.documento.removeEventListener('pointerdown', this.prepararDesdeInteraccion);
    this.documento.removeEventListener('keydown', this.prepararDesdeInteraccion);
  }

  private preparar(): Promise<boolean> {
    if (this.contexto?.state === 'running') {
      this.audioPreparado = true;
      this.dejarDeEscucharInteraccion();
      return Promise.resolve(true);
    }
    if (this.preparacionEnCurso) return this.preparacionEnCurso;
    const ventana = this.documento.defaultView as VentanaConAudio | null;
    const ConstructorAudio = ventana?.AudioContext ?? ventana?.webkitAudioContext;
    if (!ConstructorAudio) return Promise.resolve(false);
    try {
      this.contexto ??= new ConstructorAudio();
      const contexto = this.contexto;
      this.preparacionEnCurso = contexto.resume().then(() => {
        const preparado = contexto.state === 'running';
        this.audioPreparado = preparado;
        if (preparado) this.dejarDeEscucharInteraccion();
        return preparado;
      }).catch(() => {
        this.audioPreparado = false;
        return false;
      }).finally(() => { this.preparacionEnCurso = null; });
      return this.preparacionEnCurso;
    } catch {
      this.audioPreparado = false;
      return Promise.resolve(false);
    }
  }
}
