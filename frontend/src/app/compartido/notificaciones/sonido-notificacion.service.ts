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

  public constructor() {
    const preparar = () => {
      this.preparar();
      this.documento.removeEventListener('pointerdown', preparar);
      this.documento.removeEventListener('keydown', preparar);
    };
    this.documento.addEventListener('pointerdown', preparar, { once: true });
    this.documento.addEventListener('keydown', preparar, { once: true });
    this.destruirRef.onDestroy(() => {
      this.documento.removeEventListener('pointerdown', preparar);
      this.documento.removeEventListener('keydown', preparar);
      void this.contexto?.close().catch(() => undefined);
    });
  }

  public reproducir(): void {
    const contexto = this.contexto;
    if (!this.audioPreparado || !contexto || contexto.state !== 'running') return;
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

  private preparar(): void {
    const ventana = this.documento.defaultView as VentanaConAudio | null;
    const ConstructorAudio = ventana?.AudioContext ?? ventana?.webkitAudioContext;
    if (!ConstructorAudio) return;
    try {
      this.contexto ??= new ConstructorAudio();
      const reanudacion = this.contexto.resume();
      void reanudacion.then(() => { this.audioPreparado = true; }).catch(() => undefined);
    } catch {
      this.audioPreparado = false;
    }
  }
}
