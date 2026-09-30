import { describe, expect, it, vi } from 'vitest';
import type { ConsultarInventarioSap } from './inventarioArticuloRepositorio.js';
import { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';

describe('InventarioArticuloRepositorio', () => {
  it('busca coincidencias por código o descripción y conserva el SELECT parametrizado', async () => {
    const consultar = vi.fn().mockResolvedValue({ recordset: [
      { codigoArticulo: ' YAM-MODX7 ', descripcion: ' Sintetizador 76 teclas ' },
      { codigoArticulo: ' YAM-PSR ', descripcion: ' Teclado portátil ' },
    ] }) as unknown as ConsultarInventarioSap;
    const resultado = await new InventarioArticuloRepositorio(consultar)
      .buscar('yam', 20, ['BSPS04']);

    expect(resultado).toEqual([
      { codigoArticulo: 'YAM-MODX7', descripcion: 'Sintetizador 76 teclas' },
      { codigoArticulo: 'YAM-PSR', descripcion: 'Teclado portátil' },
    ]);
    const [consulta, configurar] = vi.mocked(consultar).mock.calls[0]!;
    expect(consulta.trim()).toMatch(/^SELECT\b/);
    expect(consulta).toContain('articulo.[ItemCode] LIKE @coincidencia');
    expect(consulta).toContain('articulo.[ItemName] LIKE @coincidencia');
    expect(consulta).toContain('inventarioVisible.[WhsCode] IN (@codigoAlmacen0)');
    expect(consulta).not.toContain('OPENJSON');
    expect(consulta).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC)\b/i);
    const solicitud = { input: vi.fn() };
    solicitud.input.mockReturnValue(solicitud);
    configurar!(solicitud as never);
    expect(solicitud.input).toHaveBeenCalledWith('termino', expect.anything(), 'yam');
    expect(solicitud.input).toHaveBeenCalledWith('codigoAlmacen0', expect.anything(), 'BSPS04');
  });

  it('conserva el almacén consultado con cero y devuelve solo existencias positivas', async () => {
    const consultar = vi.fn().mockResolvedValue({ recordset: [
      { codigoArticulo: ' A1 ', descripcion: ' Artículo ', codigoAlmacen: ' B1 ',
        nombreAlmacen: ' Bodega consultada ', existenciaFisica: 0, esAlmacenConsultado: 1 },
      { codigoArticulo: ' A1 ', descripcion: ' Artículo ', codigoAlmacen: ' B2 ',
        nombreAlmacen: ' Bodega baja ', existenciaFisica: 6, esAlmacenConsultado: 0 },
      { codigoArticulo: ' A1 ', descripcion: ' Artículo ', codigoAlmacen: ' B3 ',
        nombreAlmacen: ' Bodega disponible ', existenciaFisica: 20, esAlmacenConsultado: 0 },
    ] }) as unknown as ConsultarInventarioSap;

    const resultado = await new InventarioArticuloRepositorio(consultar).obtener('A1', 'B1');

    expect(resultado).toEqual({
      codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B1',
      nombreAlmacen: 'Bodega consultada', existenciaFisica: 0,
      existencias: [
        { codigoAlmacen: 'B2', nombreAlmacen: 'Bodega baja', existenciaFisica: 6 },
        { codigoAlmacen: 'B3', nombreAlmacen: 'Bodega disponible', existenciaFisica: 20 },
      ],
    });
    const llamada = vi.mocked(consultar).mock.calls[0];
    expect(llamada).toBeDefined();
    const [consulta, configurar] = llamada!;
    expect(consulta.trim()).toMatch(/^SELECT\b/);
    expect(consulta).toContain('inventario.[OnHand] > 0');
    expect(consulta).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC)\b/i);
    const solicitud = { input: vi.fn() };
    solicitud.input.mockReturnValue(solicitud);
    configurar!(solicitud as never);
    expect(solicitud.input).toHaveBeenCalledWith('codigoArticulo', expect.anything(), 'A1');
    expect(solicitud.input).toHaveBeenCalledWith('codigoAlmacen', expect.anything(), 'B1');
  });

  it('mantiene el 404 cuando no existe la combinación seleccionada', async () => {
    const consultar = vi.fn().mockResolvedValue({ recordset: [
      { codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B2',
        nombreAlmacen: 'Bodega', existenciaFisica: 5, esAlmacenConsultado: 0 },
    ] }) as unknown as ConsultarInventarioSap;

    await expect(new InventarioArticuloRepositorio(consultar).obtener('A1', 'B1'))
      .resolves.toBeNull();
  });

  it('reutiliza el mismo SELECT para consultar el artículo en todas las bodegas', async () => {
    const consultar = vi.fn().mockResolvedValue({ recordset: [
      { codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B1',
        nombreAlmacen: 'Bodega sin existencia', existenciaFisica: 0, esAlmacenConsultado: 0 },
      { codigoArticulo: 'A1', descripcion: 'Artículo', codigoAlmacen: 'B2',
        nombreAlmacen: 'Bodega disponible', existenciaFisica: 12, esAlmacenConsultado: 0 },
    ] }) as unknown as ConsultarInventarioSap;

    const resultado = await new InventarioArticuloRepositorio(consultar).obtener('A1');

    expect(resultado?.existencias).toEqual([
      { codigoAlmacen: 'B1', nombreAlmacen: 'Bodega sin existencia', existenciaFisica: 0 },
      { codigoAlmacen: 'B2', nombreAlmacen: 'Bodega disponible', existenciaFisica: 12 },
    ]);
    const [consulta, configurar] = vi.mocked(consultar).mock.calls[0]!;
    expect(consulta).toContain('@codigoAlmacen IS NULL');
    expect(consulta).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC)\b/i);
    const solicitud = { input: vi.fn() };
    solicitud.input.mockReturnValue(solicitud);
    configurar!(solicitud as never);
    expect(solicitud.input).toHaveBeenCalledWith('codigoAlmacen', expect.anything(), null);
  });
});
