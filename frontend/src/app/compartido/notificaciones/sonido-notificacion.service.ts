import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

type VentanaConAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

@Injectable({ providedIn: 'root' })
export class SonidoNotificacionService {
  private static readonly rutaAudio = '/audio/nuevo-pedido.m4a';
  private static readonly clavePreferencia = 'pedidos-bodega:sonido-notificaciones';
  private readonly documento = inject(DOCUMENT);
  private readonly destruirRef = inject(DestroyRef);
  private readonly activoSignal = signal(this.leerPreferencia());
  public readonly activo = this.activoSignal.asReadonly();
  private contexto: AudioContext | null = null;
  private audio: AudioBuffer | null = null;
  private audioPreparado = false;
  private preparacionEnCurso: Promise<boolean> | null = null;
  private cargaAudioEnCurso: Promise<AudioBuffer | null> | null = null;
  private reproduccionPendiente = false;
  private readonly prepararDesdeInteraccion = () => { void this.preparar(); };

  public constructor() {
    if (this.activoSignal()) this.escucharInteraccionParaPreparar();
    this.destruirRef.onDestroy(() => {
      this.dejarDeEscucharInteraccion();
      void this.contexto?.close().catch(() => undefined);
    });
  }

  public alternar(): void {
    const activo = !this.activoSignal();
    this.activoSignal.set(activo);
    this.guardarPreferencia(activo);
    if (activo) {
      this.escucharInteraccionParaPreparar();
      void this.preparar();
    } else {
      this.dejarDeEscucharInteraccion();
      this.reproduccionPendiente = false;
    }
  }

  public reproducir(): void {
    if (!this.activoSignal()) return;
    const contexto = this.contexto;
    if (this.audioPreparado && this.audio && contexto?.state === 'running') {
      this.emitirSonido(contexto);
      return;
    }
    if (this.reproduccionPendiente) return;
    this.reproduccionPendiente = true;
    void this.preparar().then((preparado) => {
      if (preparado && this.activoSignal() && this.contexto) this.emitirSonido(this.contexto);
    }).finally(() => { this.reproduccionPendiente = false; });
  }

  private emitirSonido(contexto: AudioContext): void {
    if (!this.activoSignal() || !this.audio) return;
    try {
      const fuente = contexto.createBufferSource();
      fuente.buffer = this.audio;
      const volumen = contexto.createGain();
      volumen.gain.setValueAtTime(1, contexto.currentTime);
      fuente.connect(volumen);
      volumen.connect(contexto.destination);
      fuente.start();
    } catch {
      // La notificación visual permanece disponible si el navegador bloquea el audio.
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

  private leerPreferencia(): boolean {
    try {
      return this.documento.defaultView?.localStorage
        .getItem(SonidoNotificacionService.clavePreferencia) !== '0';
    } catch {
      return true;
    }
  }

  private guardarPreferencia(activo: boolean): void {
    try {
      this.documento.defaultView?.localStorage.setItem(
        SonidoNotificacionService.clavePreferencia,
        activo ? '1' : '0',
      );
    } catch {
      // El control sigue funcionando durante la sesión si el navegador no permite guardar preferencias.
    }
  }

  private preparar(): Promise<boolean> {
    if (this.contexto?.state === 'running' && this.audio) {
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
      const reanudar = contexto.state === 'running' ? Promise.resolve() : contexto.resume();
      this.preparacionEnCurso = reanudar
        .then(() => this.cargarAudio(contexto))
        .then((audio) => {
          const preparado = contexto.state === 'running' && Boolean(audio);
          this.audioPreparado = preparado;
          if (preparado) this.dejarDeEscucharInteraccion();
          return preparado;
        })
        .catch(() => {
          this.audioPreparado = false;
          return false;
        })
        .finally(() => { this.preparacionEnCurso = null; });
      return this.preparacionEnCurso;
    } catch {
      this.audioPreparado = false;
      return Promise.resolve(false);
    }
  }

  private cargarAudio(contexto: AudioContext): Promise<AudioBuffer | null> {
    if (this.audio) return Promise.resolve(this.audio);
    if (this.cargaAudioEnCurso) return this.cargaAudioEnCurso;
    const ventana = this.documento.defaultView;
    if (!ventana?.fetch) return Promise.resolve(null);
    this.cargaAudioEnCurso = ventana.fetch(SonidoNotificacionService.rutaAudio)
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error('No se pudo cargar el audio.');
        return respuesta.arrayBuffer();
      })
      .then((datos) => contexto.decodeAudioData(datos))
      .then((audio) => {
        this.audio = audio;
        return audio;
      })
      .catch(() => null)
      .finally(() => { this.cargaAudioEnCurso = null; });
    return this.cargaAudioEnCurso;
  }
}
