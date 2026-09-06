USE TrackingPaquetes;
GO
IF COL_LENGTH('dbo.Usuarios','sucursalId') IS NULL ALTER TABLE dbo.Usuarios ADD sucursalId INT NULL;
GO
UPDATE u SET sucursalId=s.sucursalId FROM dbo.Usuarios u CROSS JOIN dbo.Sucursales s WHERE u.nombreUsuario='salmacen' AND s.codigo='PRIN';
UPDATE u SET sucursalId=s.sucursalId FROM dbo.Usuarios u CROSS JOIN dbo.Sucursales s WHERE u.nombreUsuario='nvalladares' AND s.codigo='PRO';
UPDATE u SET sucursalId=s.sucursalId FROM dbo.Usuarios u CROSS JOIN dbo.Sucursales s WHERE u.nombreUsuario='gcruz' AND s.codigo='CIR';
UPDATE dbo.Usuarios SET sucursalId=(SELECT TOP 1 sucursalId FROM dbo.Sucursales WHERE codigo='PRIN') WHERE sucursalId IS NULL;
ALTER TABLE dbo.Usuarios ALTER COLUMN sucursalId INT NOT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Usuarios_Sucursal') ALTER TABLE dbo.Usuarios ADD CONSTRAINT FK_Usuarios_Sucursal FOREIGN KEY(sucursalId) REFERENCES dbo.Sucursales(sucursalId);
GO
