import { describe, expect, it, vi } from 'vitest';
import {
  ImagenArticuloRepositorio,
  type ConsultarArchivoImagen,
  type ConsultarImagenArticuloSap,
  type LeerImagenArticulo,
} from './imagenArticuloRepositorio.js';

describe('ImagenArticuloRepositorio', () => {
  it('lee únicamente la imagen referenciada por SAP dentro de BitmapPath', async () => {
    const consultar = vi.fn().mockResolvedValue({ recordset: [{
      nombreArchivo: 'articulo.jpg', rutaBase: '\\\\servidor\\imagenes\\',
    }] }) as unknown as ConsultarImagenArticuloSap;
    const modificadaEn = new Date('2026-09-23T12:00:00Z');
    const consultarArchivo = vi.fn().mockResolvedValue({
      isFile: () => true, size: 3, mtime: modificadaEn,
    }) as unknown as ConsultarArchivoImagen;
    const leerArchivo = vi.fn().mockResolvedValue(Buffer.from('img')) as unknown as LeerImagenArticulo;

    const resultado = await new ImagenArticuloRepositorio(consultar, leerArchivo, consultarArchivo)
      .obtener('A1');

    expect(resultado).toEqual({
      contenido: Buffer.from('img'), tipoContenido: 'image/jpeg', modificadaEn,
    });
    expect(consultarArchivo).toHaveBeenCalledWith('\\\\servidor\\imagenes\\articulo.jpg');
    expect(leerArchivo).toHaveBeenCalledWith('\\\\servidor\\imagenes\\articulo.jpg');
    const [consulta, configurar] = vi.mocked(consultar).mock.calls[0]!;
    expect(consulta.trim()).toMatch(/^SELECT\b/);
    expect(consulta).toContain('[PicturName]');
    expect(consulta).toContain('[BitmapPath]');
    expect(consulta).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC)\b/i);
    const solicitud = { input: vi.fn() };
    solicitud.input.mockReturnValue(solicitud);
    configurar!(solicitud as never);
    expect(solicitud.input).toHaveBeenCalledWith('codigoArticulo', expect.anything(), 'A1');
  });

  it('rechaza rutas relativas, extensiones ajenas e imágenes inexistentes', async () => {
    const consultarArchivo = vi.fn() as unknown as ConsultarArchivoImagen;
    const leerArchivo = vi.fn() as unknown as LeerImagenArticulo;
    const casos = ['..\\secreto.jpg', 'documento.pdf', null];

    for (const nombreArchivo of casos) {
      const consultar = vi.fn().mockResolvedValue({ recordset: [{
        nombreArchivo, rutaBase: '\\\\servidor\\imagenes\\',
      }] }) as unknown as ConsultarImagenArticuloSap;
      await expect(new ImagenArticuloRepositorio(consultar, leerArchivo, consultarArchivo).obtener('A1'))
        .resolves.toBeNull();
    }
    expect(consultarArchivo).not.toHaveBeenCalled();
    expect(leerArchivo).not.toHaveBeenCalled();
  });
});
