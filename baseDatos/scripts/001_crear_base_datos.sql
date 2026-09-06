IF DB_ID(N'TrackingPaquetes') IS NULL
BEGIN
    EXEC(N'CREATE DATABASE TrackingPaquetes');
END;
GO
