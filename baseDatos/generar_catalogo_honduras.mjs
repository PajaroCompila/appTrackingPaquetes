import { writeFile } from 'node:fs/promises';

const respuesta = await fetch('https://raw.githubusercontent.com/MilanDroid/Honduras-ETA-JSON-structure/main/municipios.json');
if (!respuesta.ok) throw new Error('No se pudo descargar el catálogo territorial');
const fuente = (await respuesta.json())[0].departamentos;
const departamentos = [
  ['ATLANTIDA','01','Atlántida','La Ceiba'],['CHOLUTECA','02','Choluteca','Choluteca'],['COLON','03','Colón','Trujillo'],['COMAYAGUA','04','Comayagua','Comayagua'],['COPAN','05','Copán','Santa Rosa de Copán'],['CORTES','06','Cortés','San Pedro Sula'],['EL PARAISO','07','El Paraíso','Yuscarán'],['FRANCISCO MORAZAN','08','Francisco Morazán','Tegucigalpa'],['GRACIAS A DIOS','09','Gracias a Dios','Puerto Lempira'],['INTIBUCA','10','Intibucá','La Esperanza'],['ISLAS DE LA BAHIA','11','Islas de la Bahía','Roatán'],['LA PAZ','12','La Paz','La Paz'],['LEMPIRA','13','Lempira','Gracias'],['OCOTEPEQUE','14','Ocotepeque','Nueva Ocotepeque'],['OLANCHO','15','Olancho','Juticalpa'],['SANTA BARBARA','16','Santa Bárbara','Santa Bárbara'],['VALLE','17','Valle','Nacaome'],['YORO','18','Yoro','Yoro'],
];
const escapar = texto => texto.replaceAll("'", "''");
const titulo = texto => texto.toLocaleLowerCase('es-HN').replace(/(^|[\s-])\p{L}/gu, letra => letra.toLocaleUpperCase('es-HN'));
const nombresCorregidos = new Map(Object.entries({
  '0203':'Concepción de María','0214':'San José','0215':'San Marcos de Colón','0304':'Limón','0305':'Sabá','0307':'Santa Rosa de Aguán',
  '0404':'Esquías','0407':'Lamaní','0409':'Lejamaní','0413':'San Jerónimo','0414':'San José de Comayagua','0415':'San José del Potrero','0417':'San Sebastián','0421':'Taulabé',
  '0501':'Santa Rosa de Copán','0502':'Cabañas','0503':'Concepción','0504':'Copán Ruinas','0505':'Corquín','0509':'El Paraíso','0512':'La Unión','0514':'San Agustín','0516':'San Jerónimo','0517':'San José','0519':'San Nicolás',
  '0606':'Puerto Cortés','0607':'San Antonio de Cortés','0608':'San Francisco de Yojoa','0610':'Santa Cruz de Yojoa',
  '0701':'Yuscarán','0703':'Danlí','0704':'El Paraíso','0705':'Güinope','0709':'Oropolí','0713':'San Matías',
  '0802':'Alubarén','0804':'Curarén','0817':'San Antonio de Oriente','0823':'Santa Lucía','0826':'Valle de Ángeles','0827':'Villa de San Francisco',
  '1004':'Concepción','1006':'Intibucá','1007':'Jesús de Otoro','1013':'San Marcos de la Sierra','1015':'Santa Lucía','1017':'San Francisco de Opalaca',
  '1101':'Roatán','1103':'José Santos Guardiola','1203':'Cabañas','1209':'Mercedes de Oriente','1212':'San José','1214':'San Pedro de Tutule','1217':'Santa María','1218':'Santiago de Puringla',
  '1302':'Belén','1311':'La Unión','1316':'San Andrés','1321':'San Sebastián','1325':'Tomalá','1328':'San Marcos de Caiquín',
  '1402':'Belén Gualcho','1403':'Concepción','1404':'Dolores Merendón','1406':'La Encarnación','1411':'San Francisco del Valle',
  '1505':'Dulce Nombre de Culmí','1507':'Esquipulas del Norte','1513':'La Unión','1516':'Salamá','1518':'San Francisco de Becerra','1519':'San Francisco de la Paz','1520':'Santa María del Real','1522':'Yocón',
  '1601':'Santa Bárbara','1603':'Átima','1606':'San José de Colinas','1607':'Concepción del Norte','1608':'Concepción del Sur','1610':'El Níspero','1617':'Protección','1618':'Quimistán','1619':'San Francisco de Ojuera','1622':'San Nicolás','1623':'San Pedro de Zacapa',
  '1706':'Goascorán','1708':'San Francisco de Coray','1805':'Jocón','1806':'Morazán',
}));
const nombreMunicipio = (texto, codigo) => nombresCorregidos.get(codigo)
  ?? titulo(texto).replace(/\b(De|Del|La)\b/g, palabra => palabra.toLocaleLowerCase('es-HN'));
const filasDepartamentos = departamentos.map(([,codigo,nombre,cabecera]) => `('${codigo}',N'${escapar(nombre)}',N'${escapar(cabecera)}')`).join(',\n');
const filasCiudades = departamentos.flatMap(([clave,codigo]) => {
  const departamento = fuente.find(item => item.nombre === clave);
  if (!departamento) throw new Error(`Falta el departamento ${clave}`);
  return departamento.municipios.map((municipio, indice) => {
    const ciudadCodigo = `${codigo}${String(indice + 1).padStart(2,'0')}`;
    return `('${ciudadCodigo}','${codigo}',N'${escapar(nombreMunicipio(municipio.nombre ?? municipio.name, ciudadCodigo))}')`;
  });
}).join(',\n');
const sql = `USE TrackingPaquetes;\nGO\nIF OBJECT_ID(N'dbo.Departamentos',N'U') IS NULL CREATE TABLE dbo.Departamentos(codigo CHAR(2) NOT NULL PRIMARY KEY,nombre NVARCHAR(80) NOT NULL UNIQUE,cabecera NVARCHAR(80) NOT NULL);\nIF OBJECT_ID(N'dbo.Ciudades',N'U') IS NULL CREATE TABLE dbo.Ciudades(codigo CHAR(4) NOT NULL PRIMARY KEY,departamentoCodigo CHAR(2) NOT NULL REFERENCES dbo.Departamentos(codigo),nombre NVARCHAR(100) NOT NULL,CONSTRAINT UQ_Ciudades_departamento_nombre UNIQUE(departamentoCodigo,nombre));\nGO\nMERGE dbo.Departamentos AS destino USING (VALUES\n${filasDepartamentos}\n) AS origen(codigo,nombre,cabecera) ON destino.codigo=origen.codigo WHEN MATCHED THEN UPDATE SET nombre=origen.nombre,cabecera=origen.cabecera WHEN NOT MATCHED THEN INSERT(codigo,nombre,cabecera) VALUES(origen.codigo,origen.nombre,origen.cabecera);\nMERGE dbo.Ciudades AS destino USING (VALUES\n${filasCiudades}\n) AS origen(codigo,departamentoCodigo,nombre) ON destino.codigo=origen.codigo WHEN MATCHED THEN UPDATE SET departamentoCodigo=origen.departamentoCodigo,nombre=origen.nombre WHEN NOT MATCHED THEN INSERT(codigo,departamentoCodigo,nombre) VALUES(origen.codigo,origen.departamentoCodigo,origen.nombre);\nGO\nIF COL_LENGTH('dbo.Sucursales','departamentoCodigo') IS NULL ALTER TABLE dbo.Sucursales ADD departamentoCodigo CHAR(2) NULL;\nIF COL_LENGTH('dbo.Sucursales','ciudadCodigo') IS NULL ALTER TABLE dbo.Sucursales ADD ciudadCodigo CHAR(4) NULL;\nGO\nUPDATE s SET departamentoCodigo=c.departamentoCodigo,ciudadCodigo=c.codigo,ciudad=c.nombre FROM dbo.Sucursales s JOIN dbo.Ciudades c ON (s.ciudad=c.nombre OR (s.ciudad='El Progreso' AND c.nombre='El Progreso')) WHERE s.ciudadCodigo IS NULL;\nIF EXISTS(SELECT 1 FROM dbo.Sucursales WHERE ciudadCodigo IS NULL) THROW 50001,'Hay sucursales sin ciudad reconocida',1;\nALTER TABLE dbo.Sucursales ALTER COLUMN departamentoCodigo CHAR(2) NOT NULL;\nALTER TABLE dbo.Sucursales ALTER COLUMN ciudadCodigo CHAR(4) NOT NULL;\nIF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Sucursales_Departamento') ALTER TABLE dbo.Sucursales ADD CONSTRAINT FK_Sucursales_Departamento FOREIGN KEY(departamentoCodigo) REFERENCES dbo.Departamentos(codigo);\nIF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Sucursales_Ciudad') ALTER TABLE dbo.Sucursales ADD CONSTRAINT FK_Sucursales_Ciudad FOREIGN KEY(ciudadCodigo) REFERENCES dbo.Ciudades(codigo);\nGO\n`;
const sqlCompleto = sql.replace(
  "IF EXISTS(SELECT 1 FROM dbo.Sucursales WHERE ciudadCodigo IS NULL)",
  "UPDATE dbo.Sucursales SET departamentoCodigo='08', ciudadCodigo='0801' WHERE ciudadCodigo IS NULL AND ciudad='Tegucigalpa';\nIF EXISTS(SELECT 1 FROM dbo.Sucursales WHERE ciudadCodigo IS NULL)",
);
await writeFile(new URL('./scripts/008_catalogo_departamentos_ciudades.sql', import.meta.url), sqlCompleto, 'utf8');
console.log(`Catálogo generado: ${departamentos.length} departamentos y 298 ciudades.`);
