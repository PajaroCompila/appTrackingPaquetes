import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UsuariosComponent } from './usuarios.component';
import { AutenticacionService } from '../autenticacion/autenticacion.service';

describe('Guardar rol desde el formulario', () => {
  async function preparar() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [UsuariosComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(UsuariosComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.match(r => r.method === 'GET').forEach(r => r.flush(r.request.url.endsWith('/roles')
      ? { datos: [{rolId:'1',codigo:'CONSULTA',nombre:'Consulta'}, {rolId:'2',codigo:'DASHBOARDS',nombre:'DASHBOARDS'}] }
      : { datos: [], paginacion: {hayMas:false,totalRegistros:0} }));
    fixture.componentInstance.editar({usuarioId:'11111111-1111-4111-8111-111111111111', nombreCompleto:'Prueba', nombreUsuario:'prueba',correo:null,codigoRol:'CONSULTA',nombreRol:'Consulta',activo:true,debeCambiarContrasena:false,ultimoAcceso:null,creadoEn:'',actualizadoEn:'',codigosAlmacenVisibles:[]} as never);
    fixture.detectChanges();
    await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('#formRol') as HTMLSelectElement;
    select.value = 'DASHBOARDS';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const boton = fixture.nativeElement.querySelector('.modal button[type="submit"]') as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();
    const solicitud = http.expectOne(r => r.method === 'PATCH');
    expect(solicitud.request.body).toEqual({nombreCompleto:'Prueba',nombreUsuario:'prueba',correo:'',codigoRol:'DASHBOARDS'});
    expect(boton.disabled).toBe(true);
    return { fixture, http, solicitud };
  }
  it('guarda al pulsar el boton y confirma el resultado', async () => {
    const {fixture,http,solicitud} = await preparar();
    solicitud.flush({datos:{codigoRol:'DASHBOARDS'}});
    http.expectOne(r => r.method === 'GET').flush({datos:[],paginacion:{hayMas:false,totalRegistros:0}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('guardado correctamente');
    http.verify();
  });
  it('muestra el error dentro del modal y permite reintentar', async () => {
    const {fixture,http,solicitud} = await preparar();
    solicitud.flush({mensaje:'El rol no existe o esta inactivo.'},{status:404,statusText:'Not Found'});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal [role="alert"]').textContent).toContain('El rol no existe');
    expect(fixture.nativeElement.querySelector('.modal button[type="submit"]').disabled).toBe(false);
    http.verify();
  });
});

describe('Eliminar usuario', () => {
  const usuario = {usuarioId:'22222222-2222-4222-8222-222222222222',nombreCompleto:'Operador Prueba',
    nombreUsuario:'operador.prueba',correo:null,codigoRol:'OPERADOR_BODEGA',nombreRol:'Operador',activo:true,
    debeCambiarContrasena:false,ultimoAcceso:null,creadoEn:'',actualizadoEn:'',codigosAlmacenVisibles:[]} as const;

  function preparar() {
    localStorage.clear();
    TestBed.configureTestingModule({imports:[UsuariosComponent],providers:[provideHttpClient(),provideHttpClientTesting()]});
    const autenticacion=TestBed.inject(AutenticacionService);
    autenticacion.usuario.set({usuarioId:'11111111-1111-4111-8111-111111111111',nombreUsuario:'sistemas',
      nombreVisible:'Sistemas',codigoRol:'ADMINISTRADOR',codigoAlmacen:null,codigosAlmacenVisibles:[],
      debeCambiarContrasena:false});
    const fixture=TestBed.createComponent(UsuariosComponent);const http=TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.match(r=>r.method==='GET').forEach(r=>r.flush(r.request.url.endsWith('/roles')?{datos:[]}
      :r.request.url.endsWith('/almacenes-disponibles')?{datos:[]}
      :{datos:[usuario],paginacion:{hayMas:false,totalRegistros:1}}));
    fixture.detectChanges();return{fixture,http};
  }

  it('Cancelar cierra el modal sin enviar la eliminación',()=>{const{fixture,http}=preparar();
    (fixture.nativeElement.querySelector('[aria-label="Eliminar usuario"]') as HTMLButtonElement).click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.confirmacion-eliminar').textContent).toContain('Operador Prueba');
    (fixture.nativeElement.querySelector('.acciones-modal .boton-secundario') as HTMLButtonElement).click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal')).toBeNull();http.expectNone(r=>r.method==='DELETE');http.verify();});

  it('no muestra la acción a roles distintos de administrador',()=>{const{fixture,http}=preparar();
    TestBed.inject(AutenticacionService).usuario.update(actual=>actual?{...actual,codigoRol:'OPERADOR_BODEGA'}:actual);
    fixture.detectChanges();expect(fixture.nativeElement.querySelector('[aria-label="Eliminar usuario"]')).toBeNull();http.verify();});

  it('confirma, bloquea clics repetidos y refresca conservando filtros',()=>{const{fixture,http}=preparar();
    (fixture.nativeElement.querySelector('[aria-label="Eliminar usuario"]') as HTMLButtonElement).click();fixture.detectChanges();
    const confirmar=fixture.nativeElement.querySelector('.boton-peligro') as HTMLButtonElement;confirmar.click();fixture.detectChanges();
    const solicitud=http.expectOne(r=>r.method==='DELETE'&&r.url.endsWith(`/${usuario.usuarioId}`));
    expect(confirmar.disabled).toBe(true);solicitud.flush(null);http.expectOne(r=>r.method==='GET'&&r.url.includes('/usuarios')).flush({datos:[],paginacion:{hayMas:false,totalRegistros:0}});
    fixture.detectChanges();expect(fixture.nativeElement.querySelector('.modal')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Usuario eliminado correctamente');http.verify();});

  it('mantiene el usuario y el modal cuando backend rechaza la operación',()=>{const{fixture,http}=preparar();
    (fixture.nativeElement.querySelector('[aria-label="Eliminar usuario"]') as HTMLButtonElement).click();fixture.detectChanges();
    (fixture.nativeElement.querySelector('.boton-peligro') as HTMLButtonElement).click();
    http.expectOne(r=>r.method==='DELETE').flush({mensaje:'El usuario tiene pedidos activos asignados.'},{status:409,statusText:'Conflict'});
    fixture.detectChanges();expect(fixture.nativeElement.querySelector('.modal [role="alert"]').textContent).toContain('pedidos activos');
    expect(fixture.componentInstance.usuarios()).toHaveLength(1);http.verify();});
});

describe('Personal para asignaciones', () => {
  function preparar() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [UsuariosComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    const autenticacion = TestBed.inject(AutenticacionService);
    autenticacion.usuario.set({ usuarioId: '11111111-1111-4111-8111-111111111111', nombreUsuario: 'sistemas',
      nombreVisible: 'Sistemas', codigoRol: 'ADMINISTRADOR', codigoAlmacen: null,
      codigosAlmacenVisibles: [], debeCambiarContrasena: false });
    const fixture = TestBed.createComponent(UsuariosComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.match(r => r.method === 'GET').forEach(r => r.flush(r.request.url.endsWith('/roles')
      || r.request.url.endsWith('/almacenes-disponibles') || r.request.url.endsWith('/personal-asignable')
      ? { datos: [] } : { datos: [], paginacion: { hayMas: false, totalRegistros: 0 } }));
    fixture.detectChanges();
    return { fixture, http };
  }

  it('abre el modal corporativo con únicamente nombre y apellido y los exige', () => {
    const { fixture, http } = preparar();
    (fixture.nativeElement.querySelector('.personal-asignable .boton-primario') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#personalNombre')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#personalApellido')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#formUsuario')).toBeNull();
    fixture.componentInstance.guardarPersonalAsignable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal [role="alert"]').textContent)
      .toContain('Nombre y apellido son obligatorios');
    http.expectNone(r => r.method === 'POST');
    http.verify();
  });

  it('guarda y refresca únicamente el catálogo para mostrar la persona inmediatamente', () => {
    const { fixture, http } = preparar();
    fixture.componentInstance.nuevoAsignado();
    fixture.componentInstance.formPersonal = { nombre: 'Ángel', apellido: 'Zelaya' };
    fixture.componentInstance.guardarPersonalAsignable();
    const persona = { idPersonal: '33333333-3333-4333-8333-333333333333',
      codigoAsignacion: 'PERSONAL:333', nombre: 'Ángel', apellido: 'Zelaya',
      nombreCompleto: 'Ángel Zelaya', ambito: 'GENERAL', activo: true,
      fechaCreacion: '2026-10-13T12:00:00.000Z' };
    const guardar = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/personal-asignable'));
    expect(guardar.request.body).toEqual({ nombre: 'Ángel', apellido: 'Zelaya' });
    guardar.flush({ datos: persona });
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/personal-asignable'))
      .flush({ datos: [persona] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.persona-asignable strong').textContent)
      .toContain('Ángel Zelaya');
    http.verify();
  });
});
