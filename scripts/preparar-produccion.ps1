[CmdletBinding()]
param(
  [switch]$InstalarDependencias
)

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')

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

$npmCandidatos = @()
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
  if ($base) {
    $npmCandidatos += Join-Path $base 'nodejs\npm.cmd'
  }
}

$npm = Resolver-Comando -Nombre 'npm.cmd' -RutasCandidatas $npmCandidatos

function Ejecutar-Npm {
  param(
    [Parameter(Mandatory = $true)][string]$Directorio,
    [Parameter(Mandatory = $true)][string[]]$Argumentos
  )

  Push-Location $Directorio
  try {
    & $npm @Argumentos
    if ($LASTEXITCODE -ne 0) {
      throw "npm $($Argumentos -join ' ') fallo en $Directorio con codigo $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

$frontend = Join-Path $raiz 'frontend'
$backend = Join-Path $raiz 'backend'

if ($InstalarDependencias) {
  Ejecutar-Npm -Directorio $frontend -Argumentos @('ci')
  Ejecutar-Npm -Directorio $backend -Argumentos @('ci')
}

Ejecutar-Npm -Directorio $frontend -Argumentos @('run', 'build')
Ejecutar-Npm -Directorio $backend -Argumentos @('run', 'build')

Write-Host 'Build de produccion listo.'
