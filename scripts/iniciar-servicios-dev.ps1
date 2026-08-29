[CmdletBinding()]
param(
  [switch]$Supervisor
)

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$backend = Join-Path $raiz 'backend'
$frontend = Join-Path $raiz 'frontend'
$directorioLogs = Join-Path $raiz 'logs'
$archivoSupervisor = Join-Path $directorioLogs 'servicios-dev-supervisor.log'

function Escribir-Log {
  param([Parameter(Mandatory = $true)][string]$Mensaje)
  New-Item -ItemType Directory -Path $directorioLogs -Force | Out-Null
  "[$(Get-Date -Format o)] $Mensaje" | Out-File -FilePath $archivoSupervisor -Append -Encoding utf8
}

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

function Puerto-En-Uso {
  param([Parameter(Mandatory = $true)][int]$Puerto)
  $conexion = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return $null -ne $conexion
}

function Iniciar-Proceso-Npm {
  param(
    [Parameter(Mandatory = $true)][string]$Nombre,
    [Parameter(Mandatory = $true)][string]$Directorio,
    [Parameter(Mandatory = $true)][string[]]$Argumentos,
    [Parameter(Mandatory = $true)][int]$Puerto
  )

  if (Puerto-En-Uso -Puerto $Puerto) {
    Escribir-Log "$Nombre no se inicia porque el puerto $Puerto ya esta en uso."
    return $null
  }

  $stdout = Join-Path $directorioLogs "$Nombre-dev.out.log"
  $stderr = Join-Path $directorioLogs "$Nombre-dev.err.log"
  Escribir-Log "Iniciando $Nombre en puerto $Puerto."
  return Start-Process -FilePath $script:npm -ArgumentList $Argumentos -WorkingDirectory $Directorio `
    -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Iniciar-Frontend {
  $ciAnterior = $env:CI
  try {
    $env:CI = 'true'
    return Iniciar-Proceso-Npm -Nombre 'frontend' -Directorio $frontend `
      -Argumentos @('start') -Puerto 4400
  } finally {
    if ($null -eq $ciAnterior) {
      Remove-Item Env:\CI -ErrorAction SilentlyContinue
    } else {
      $env:CI = $ciAnterior
    }
  }
}

$npmCandidatos = @()
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
  if ($base) {
    $npmCandidatos += Join-Path $base 'nodejs\npm.cmd'
  }
}

$script:npm = Resolver-Comando -Nombre 'npm.cmd' -RutasCandidatas $npmCandidatos
Escribir-Log "Supervisor iniciado. Raiz: $raiz"

$procesoBackend = $null
$procesoFrontend = $null

do {
  if ($procesoBackend -and $procesoBackend.HasExited) {
    Escribir-Log "Backend finalizo con codigo $($procesoBackend.ExitCode)."
    $procesoBackend = $null
  }

  if ($procesoFrontend -and $procesoFrontend.HasExited) {
    Escribir-Log "Frontend finalizo con codigo $($procesoFrontend.ExitCode)."
    $procesoFrontend = $null
  }

  if (-not $procesoBackend -and -not (Puerto-En-Uso -Puerto 3280)) {
    $procesoBackend = Iniciar-Proceso-Npm -Nombre 'backend' -Directorio $backend `
      -Argumentos @('run', 'dev') -Puerto 3280
  }

  if (-not $procesoFrontend -and -not (Puerto-En-Uso -Puerto 4400)) {
    $procesoFrontend = Iniciar-Frontend
  }

  if (-not $Supervisor) {
    break
  }

  Start-Sleep -Seconds 15
} while ($true)
