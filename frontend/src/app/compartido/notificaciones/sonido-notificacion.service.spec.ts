import { TestBed } from '@angular/core/testing';
import { SonidoNotificacionService } from './sonido-notificacion.service';

class AudioContextoPrueba {
  public static instancias: AudioContextoPrueba[] = [];
  public static resultadosReanudacion: ('resolver' | 'rechazar')[] = [];
  public state: AudioContextState = 'suspended';
  public currentTime = 0;
  public destination = {} as AudioDestinationNode;
  public iniciosAudio = 0;
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

  public decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({} as AudioBuffer);
  }

  public createBufferSource(): AudioBufferSourceNode {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(() => { this.iniciosAudio += 1; }),
    } as unknown as AudioBufferSourceNode;
  }

}

describe('SonidoNotificacionService', () => {
  const descriptorOriginal = Object.getOwnPropertyDescriptor(window, 'AudioContext');
  const descriptorFetchOriginal = Object.getOwnPropertyDescriptor(window, 'fetch');

  beforeEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.removeItem('pedidos-bodega:sonido-notificaciones');
    AudioContextoPrueba.instancias = [];
    AudioContextoPrueba.resultadosReanudacion = [];
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: AudioContextoPrueba,
    });
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      }),
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.removeItem('pedidos-bodega:sonido-notificaciones');
    if (descriptorOriginal) Object.defineProperty(window, 'AudioContext', descriptorOriginal);
    else Reflect.deleteProperty(window, 'AudioContext');
    if (descriptorFetchOriginal) Object.defineProperty(window, 'fetch', descriptorFetchOriginal);
    else Reflect.deleteProperty(window, 'fetch');
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
    await vi.waitFor(() => expect(contexto?.iniciosAudio).toBe(1));
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

    await vi.waitFor(() => expect(contexto.iniciosAudio).toBe(1));
  });

  it('guarda la preferencia y no reproduce alertas cuando el sonido está desactivado', async () => {
    const servicio = TestBed.inject(SonidoNotificacionService);
    document.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(AudioContextoPrueba.instancias[0]?.state).toBe('running'));

    servicio.alternar();
    servicio.reproducir();

    expect(servicio.activo()).toBe(false);
    expect(window.localStorage.getItem('pedidos-bodega:sonido-notificaciones')).toBe('0');
    expect(AudioContextoPrueba.instancias[0]?.iniciosAudio).toBe(0);
  });

  it('recupera la preferencia guardada al iniciar', () => {
    window.localStorage.setItem('pedidos-bodega:sonido-notificaciones', '0');

    const servicio = TestBed.inject(SonidoNotificacionService);

    expect(servicio.activo()).toBe(false);
    expect(AudioContextoPrueba.instancias).toHaveLength(0);
  });
});
