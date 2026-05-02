[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Resolve-Python {
    param([string]$ProjectRoot)

    $venvPython = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }
    if (Test-Command "py") {
        return "py -3"
    }
    if (Test-Command "python") {
        return "python"
    }
    throw "Python was not found. Run .\setup.ps1 first."
}

function Assert-RequiredTools {
    foreach ($commandName in @("node", "npm", "ffmpeg", "ffprobe")) {
        if (-not (Test-Command $commandName)) {
            throw "$commandName is missing. Run .\setup.ps1 first."
        }
    }
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"

Refresh-Path

$pythonCommand = Resolve-Python -ProjectRoot $projectRoot

Assert-RequiredTools

Write-Step "Starting YTPilot backend on port $BackendPort"
$backendCmd = if ($pythonCommand -like "*.exe") {
    "& `"$pythonCommand`" -m uvicorn app.main:app --reload --host 127.0.0.1 --port $BackendPort"
}
else {
    "$pythonCommand -m uvicorn app.main:app --reload --host 127.0.0.1 --port $BackendPort"
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WorkingDirectory $backendDir | Out-Null

Write-Step "Starting YTPilot frontend on port $FrontendPort"
$frontendCmd = "npm run dev -- --port $FrontendPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WorkingDirectory $frontendDir | Out-Null

Write-Step "YTPilot is launching"
Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "Backend:  http://localhost:$BackendPort" -ForegroundColor Green
Write-Host "Two new PowerShell windows were opened for the dev servers." -ForegroundColor Green
