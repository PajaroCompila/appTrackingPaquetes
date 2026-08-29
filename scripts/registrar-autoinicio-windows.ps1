[CmdletBinding()]
param(
  [string]$NombreTarea = 'PedidosBodega-App',
  [switch]$Force,
  [switch]$IniciarAhora
)

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$scriptInicio = Join-Path $PSScriptRoot 'iniciar-produccion.ps1'

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

$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptInicio`""
$accion = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument $argumentos `
  -WorkingDirectory $raiz
$disparador = New-ScheduledTaskTrigger -AtStartup
$configuracion = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest

Register-ScheduledTask `
  -TaskName $NombreTarea `
  -Action $accion `
  -Trigger $disparador `
  -Settings $configuracion `
  -Principal $principal `
  -Description 'Inicia Pedidos Bodega al arrancar Windows.' | Out-Null

if ($IniciarAhora) {
  Start-ScheduledTask -TaskName $NombreTarea
}

Write-Host "Tarea $NombreTarea registrada para iniciar con Windows."
