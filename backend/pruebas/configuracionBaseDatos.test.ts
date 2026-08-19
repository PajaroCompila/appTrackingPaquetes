import { describe, expect, it } from 'vitest';
import {
  obtenerConfiguracionPedidosBodega,
  obtenerConfiguracionSistemaOrigen,
  validarSeparacionConexiones,
} from '../src/configuracion/configuracionBaseDatos.js';

function variables(prefijo: 'SISTEMA_ORIGEN' | 'PEDIDOS_BODEGA') {
  return {
    [`${prefijo}_SQL_SERVIDOR`]: '192.168.10.150',
    [`${prefijo}_SQL_PUERTO`]: '1433',
    [`${prefijo}_SQL_BASE_DATOS`]: prefijo === 'SISTEMA_ORIGEN' ? 'Retail One' : 'PedidosBodega',
    [`${prefijo}_SQL_USUARIO`]: prefijo === 'SISTEMA_ORIGEN' ? 'retail_lectura' : 'pedidos_bodega_app',
    [`${prefijo}_SQL_CONTRASENA`]: 'secreto-de-prueba',
    [`${prefijo}_SQL_CIFRAR`]: 'false',
    [`${prefijo}_SQL_CONFIAR_CERTIFICADO`]: 'false',
  };
}

describe('configuración de conexiones separadas', () => {
  it('acepta identidades distintas y la base propia autorizada', () => {
    expect(obtenerConfiguracionSistemaOrigen(variables('SISTEMA_ORIGEN')).usuario).toBe('retail_lectura');
    expect(obtenerConfiguracionPedidosBodega(variables('PEDIDOS_BODEGA')).baseDatos)
      .toBe('PedidosBodega');
  });

  it('admite temporalmente sa manteniendo variables separadas', () => {
    expect(obtenerConfiguracionSistemaOrigen({
      ...variables('SISTEMA_ORIGEN'), SISTEMA_ORIGEN_SQL_USUARIO: 'sa',
    }).usuario).toBe('sa');
    expect(obtenerConfiguracionPedidosBodega({
      ...variables('PEDIDOS_BODEGA'), PEDIDOS_BODEGA_SQL_USUARIO: 'sa',
    }).usuario).toBe('sa');
  });

  it('rechaza master y cualquier servidor distinto para la base propia', () => {
    expect(() => obtenerConfiguracionPedidosBodega({
      ...variables('PEDIDOS_BODEGA'), PEDIDOS_BODEGA_SQL_BASE_DATOS: 'master',
    })).toThrow(/exclusivamente/i);
    expect(() => obtenerConfiguracionPedidosBodega({
      ...variables('PEDIDOS_BODEGA'), PEDIDOS_BODEGA_SQL_SERVIDOR: '127.0.0.1',
    })).toThrow(/exclusivamente/i);
  });

  it('admite identidades iguales pero conserva destinos separados', () => {
    expect(() => validarSeparacionConexiones({
      ...variables('SISTEMA_ORIGEN'),
      ...variables('PEDIDOS_BODEGA'),
      SISTEMA_ORIGEN_SQL_USUARIO: 'pedidos_bodega_app',
    })).not.toThrow();
    expect(() => obtenerConfiguracionSistemaOrigen({
      ...variables('SISTEMA_ORIGEN'), SISTEMA_ORIGEN_SQL_BASE_DATOS: 'master',
    })).toThrow(/base autorizada/i);
  });
});
