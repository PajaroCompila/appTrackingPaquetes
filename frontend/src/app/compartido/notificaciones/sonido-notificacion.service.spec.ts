import { TestBed } from '@angular/core/testing';
import { SonidoNotificacionService } from './sonido-notificacion.service';

class AudioContextoPrueba {
  public static instancias: AudioContextoPrueba[] = [];
  public static resultadosReanudacion: ('resolver' | 'rechazar')[] = [];
  public state: AudioContextState = 'suspended';
  public currentTime = 0;
  public destination = {} as AudioDestinationNode;
  public iniciosOscilador = 0;
  public readonly resume = vi.fn(async () => {
    const resultado = AudioContextoPrueba.resultadosReanudacion.shift() ?? 'resolver';
    if (resultado === 'rechazar') throw new DOMException('Bloqueado', 'NotAllowedError');
    this.state = 'running';
  });
  public readonly close = vi.fn(async () => { this.state = 'closed'; });

  public constructor() {
    AudioContextoPrueba.instancias.push(this);
  }

  public createGain(): GainNode {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    } as unknown as GainNode;
  }

  public createOscillator(): OscillatorNode {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(() => { this.iniciosOscilador += 1; }),
      stop: vi.fn(),
    } as unknown as OscillatorNode;
  }
}

describe('SonidoNotificacionService', () => {
  const descriptorOriginal = Object.getOwnPropertyDescriptor(window, 'AudioContext');

  beforeEach(() => {
    TestBed.resetTestingModule();
    AudioContextoPrueba.instancias = [];
    AudioContextoPrueba.resultadosReanudacion = [];
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextoPrueba,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (descriptorOriginal) Object.defineProperty(window, 'AudioContext', descriptorOriginal);
    else Reflect.deleteProperty(window, 'AudioContext');
  });

  it('reintenta preparar el audio si el navegador bloquea la primera interacción', async () => {
    AudioContextoPrueba.resultadosReanudacion = ['rechazar', 'resolver'];
    const servicio = TestBed.inject(SonidoNotificacionService);

    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(AudioContextoPrueba.instancias[0]?.resume).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect((servicio as unknown as {
      preparacionEnCurso: Promise<boolean> | null;
    }).preparacionEnCurso).toBeNull());
    document.dispatchEvent(new Event('keydown'));
    await vi.waitFor(() => expect(AudioContextoPrueba.instancias[0]?.resume).toHaveBeenCalledTimes(2));
    servicio.reproducir();

    const contexto = AudioContextoPrueba.instancias[0];
    expect(contexto?.resume).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(contexto?.iniciosOscilador).toBe(2));
  });

  it('reanuda un contexto suspendido antes de emitir una sola alerta', async () => {
    const servicio = TestBed.inject(SonidoNotificacionService);
    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(AudioContextoPrueba.instancias[0]?.state).toBe('running'));
    await vi.waitFor(() => expect((servicio as unknown as {
      preparacionEnCurso: Promise<boolean> | null;
    }).preparacionEnCurso).toBeNull());
    const contexto = AudioContextoPrueba.instancias[0]!;
    contexto.state = 'suspended';

    servicio.reproducir();
    await vi.waitFor(() => expect(contexto.resume).toHaveBeenCalledTimes(2));

    await vi.waitFor(() => expect(contexto.iniciosOscilador).toBe(2));
  });
});
