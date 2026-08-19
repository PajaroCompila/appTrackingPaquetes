export interface EstadoSalud {
  estado: 'disponible';
  fechaHora: string;
}

export interface RespuestaSalud {
  datos: EstadoSalud;
}

