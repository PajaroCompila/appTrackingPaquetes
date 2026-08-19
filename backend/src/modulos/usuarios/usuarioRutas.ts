import { Router } from 'express';
import { requerirRoles } from '../autenticacion/autenticacionMiddleware.js';
import { UsuarioServicio } from './usuarioServicio.js';
import { esquemaCrearUsuario, esquemaEditarUsuario, esquemaEstadoUsuario, esquemaIdUsuario,
  esquemaListadoUsuarios, esquemaRestablecer } from './usuarioValidacion.js';

export const usuarioRutas=Router();
const servicio=new UsuarioServicio();
usuarioRutas.use(requerirRoles('ADMINISTRADOR'));
usuarioRutas.get('/roles',async(_s,r,n)=>{try{r.json({datos:await servicio.roles()});}catch(e){n(e);}});
usuarioRutas.get('/',async(s,r,n)=>{try{const f=esquemaListadoUsuarios.parse(s.query);const x=await servicio.listar(f);
  r.json({datos:x.usuarios,paginacion:{pagina:f.pagina,cantidadPorPagina:f.cantidadPorPagina,totalRegistros:x.total,
    hayMas:f.pagina*f.cantidadPorPagina<x.total}});}catch(e){n(e);}});
usuarioRutas.get('/:usuarioId',async(s,r,n)=>{try{r.json({datos:await servicio.obtener(esquemaIdUsuario.parse(s.params.usuarioId))});}catch(e){n(e);}});
usuarioRutas.post('/',async(s,r,n)=>{try{const d=esquemaCrearUsuario.parse(s.body);const {confirmarContrasena:_c,...datos}=d;void _c;
  r.status(201).json({datos:await servicio.crear(datos)});}catch(e){n(e);}});
usuarioRutas.patch('/:usuarioId',async(s,r,n)=>{try{r.json({datos:await servicio.editar(esquemaIdUsuario.parse(s.params.usuarioId),esquemaEditarUsuario.parse(s.body))});}catch(e){n(e);}});
usuarioRutas.patch('/:usuarioId/estado',async(s,r,n)=>{try{const d=esquemaEstadoUsuario.parse(s.body);r.json({datos:await servicio.cambiarEstado(esquemaIdUsuario.parse(s.params.usuarioId),d.activo,s.user!.usuarioId)});}catch(e){n(e);}});
usuarioRutas.post('/:usuarioId/restablecer-contrasena',async(s,r,n)=>{try{const d=esquemaRestablecer.parse(s.body);
  await servicio.restablecer(esquemaIdUsuario.parse(s.params.usuarioId),d.contrasena);r.status(204).send();}catch(e){n(e);}});
