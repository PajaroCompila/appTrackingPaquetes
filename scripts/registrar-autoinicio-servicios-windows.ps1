[CmdletBinding()]
param(
  [string]$NombreTarea = 'PedidosBodega-Servicios-Dev',
  [switch]$Force,
  [switch]$IniciarAhora,
  [switch]$UsuarioActual
)

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$scriptInicio = Join-Path $PSScriptRoot 'iniciar-servicios-dev.ps1'

if (-not (Test-Path -LiteralPath $scriptInicio)) {
  throw "No existe $scriptInicio."
}

$existente = Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue
if ($existente) {
  if (-not $Force) {
    Write-Host "La tarea $NombreTarea ya existe. Use -Force para reemplazarla."
    exit 0
  }

  Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false
}

$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptInicio`" -Supervisor"
$accion = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument $argumentos `
  -WorkingDirectory $raiz
$configuracion = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

function Registrar-Como-System {
  $disparador = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
  Register-ScheduledTask `
    -TaskName $NombreTarea `
    -Action $accion `
    -Trigger $disparador `
    -Settings $configuracion `
    -Principal $principal `
    -Description 'Inicia backend y frontend de Pedidos Bodega al arrancar Windows.' | Out-Null
  Write-Host "Tarea $NombreTarea registrada como SYSTEM para iniciar con Windows."
}

function Registrar-Como-UsuarioActual {
  $usuario = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $disparador = New-ScheduledTaskTrigger -AtLogOn -User $usuario
  $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask `
    -TaskName $NombreTarea `
    -Action $accion `
    -Trigger $disparador `
    -Settings $configuracion `
    -Principal $principal `
    -Description 'Inicia backend y frontend de Pedidos Bodega al iniciar sesion.' | Out-Null
  Write-Host "Tarea $NombreTarea registrada para iniciar sesion de $usuario."
}

if ($UsuarioActual) {
  Registrar-Como-UsuarioActual
} else {
  try {
    Registrar-Como-System
  } catch {
    if ($_.Exception.Message -notmatch 'Acceso denegado|Access is denied|0x80070005') {
      throw
    }

    Write-Warning 'No hay permisos para registrar la tarea como SYSTEM; se registrara con el usuario actual.'
    Registrar-Como-UsuarioActual
  }
}

if ($IniciarAhora) {
  Start-ScheduledTask -TaskName $NombreTarea
}
