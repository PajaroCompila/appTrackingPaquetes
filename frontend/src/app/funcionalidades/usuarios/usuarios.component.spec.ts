import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UsuariosComponent } from './usuarios.component';

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
