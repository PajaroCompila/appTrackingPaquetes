export const ambitosPersonalAsignable = ['GENERAL', 'ACALIX_JLARA', 'TCIR01', 'TTBM01'] as const;

export type AmbitoPersonalAsignable = typeof ambitosPersonalAsignable[number];

export interface PersonalAsignable {
  idPersonal: string;
  codigoAsignacion: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  ambito: AmbitoPersonalAsignable;
  activo: boolean;
  fechaCreacion: string;
}

export interface NuevoPersonalAsignable {
  nombre: string;
  apellido: string;
}
