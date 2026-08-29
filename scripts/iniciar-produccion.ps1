[CmdletBinding()]
param(
  [switch]$Validar,
  [int]$Puerto = 0
)

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$backend = Join-Path $raiz 'backend'
$servidorBackend = Join-Path $backend 'dist\servidor.js'
$indiceFrontend = Join-Path $raiz 'frontend\dist\frontend\browser\index.html'
$directorioLogs = Join-Path $raiz 'logs'
$archivoLog = Join-Path $directorioLogs 'pedidos-bodega.log'

function Resolver-Comando {
  param(
    [Parameter(Mandatory = $true)][string]$Nombre,
    [string[]]$RutasCandidatas = @()
  )

  $comando = Get-Command $Nombre -ErrorAction SilentlyContinue
  if ($comando) {
    return $comando.Source
  }

  foreach ($ruta in $RutasCandidatas) {
    if ($ruta -and (Test-Path -LiteralPath $ruta)) {
      return (Resolve-Path -LiteralPath $ruta).Path
    }
  }

  throw "No se encontro $Nombre. Instale Node.js o agreguelo al PATH."
}

$nodeCandidatos = @()
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
  if ($base) {
    $nodeCandidatos += Join-Path $base 'nodejs\node.exe'
  }
}

$node = Resolver-Comando -Nombre 'node.exe' -RutasCandidatas $nodeCandidatos

if (-not (Test-Path -LiteralPath $servidorBackend)) {
  throw "No existe $servidorBackend. Ejecute scripts\preparar-produccion.ps1 antes de iniciar."
}

if (-not (Test-Path -LiteralPath $indiceFrontend)) {
  throw "No existe $indiceFrontend. Ejecute scripts\preparar-produccion.ps1 antes de iniciar."
}

if ($Validar) {
  Write-Host 'La app esta lista para iniciar.'
  exit 0
}

New-Item -ItemType Directory -Path $directorioLogs -Force | Out-Null
$env:SERVIR_FRONTEND = 'true'
if ($Puerto -gt 0) {
  $env:PUERTO = [string]$Puerto
}

Push-Location $backend
try {
  $puertoLog = if ($env:PUERTO) { $env:PUERTO } else { '3280' }
  "[$(Get-Date -Format o)] Iniciando Pedidos Bodega en puerto $puertoLog" |
    Out-File -FilePath $archivoLog -Append -Encoding utf8
  & $node $servidorBackend *>> $archivoLog
  $codigoSalida = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  "[$(Get-Date -Format o)] Pedidos Bodega finalizo con codigo $codigoSalida" |
    Out-File -FilePath $archivoLog -Append -Encoding utf8
  exit $codigoSalida
} finally {
  Pop-Location
}
