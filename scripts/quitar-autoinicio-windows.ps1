[CmdletBinding()]
param(
  [string]$NombreTarea = 'PedidosBodega-App'
)

$ErrorActionPreference = 'Stop'
$existente = Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue

if (-not $existente) {
  Write-Host "La tarea $NombreTarea no existe."
  exit 0
}

Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false
Write-Host "Tarea $NombreTarea eliminada."
