[CmdletBinding()]
param(
    [switch]$SkipNodeModules,
    [switch]$SkipPythonPackages,
    [switch]$SkipWinget
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

function Assert-Winget {
    if ($SkipWinget) {
        return $false
    }
    return (Test-Command "winget")
}

function Install-WithWinget {
    param(
        [string]$Id,
        [string]$Label,
        [string[]]$CommandNames
    )

    $missing = $true
    foreach ($commandName in $CommandNames) {
        if (Test-Command $commandName) {
            $missing = $false
        }
    }

    if (-not $missing) {
        Write-Host "$Label already available." -ForegroundColor Green
        return
    }

    if (-not (Assert-Winget)) {
        throw "winget is required to install $Label automatically. Install winget or rerun with the dependency preinstalled."
    }

    Write-Step "Installing $Label with winget"
    winget install --id $Id --exact --accept-source-agreements --accept-package-agreements
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Resolve-Python {
    if (Test-Command "py") {
        return "py -3"
    }
    if (Test-Command "python") {
        return "python"
    }
    throw "Python was not found after installation."
}

function Resolve-Pip {
    param([string]$PythonCommand)
    return "$PythonCommand -m pip"
}

function Install-PythonPackages {
    param([string]$Root, [string]$PythonCommand)

    if ($SkipPythonPackages) {
        Write-Host "Skipping Python package installation." -ForegroundColor Yellow
        return
    }

    $backendDir = Join-Path $Root "backend"
    $venvDir = Join-Path $backendDir ".venv"
    $requirements = Join-Path $backendDir "requirements.txt"

    Write-Step "Setting up Python virtual environment"
    & cmd /c "$PythonCommand -m venv `"$venvDir`""

    $venvPython = Join-Path $venvDir "Scripts\python.exe"
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r $requirements
    & $venvPython -m pip install yt-dlp
}

function Install-NodePackages {
    param([string]$Root)

    if ($SkipNodeModules) {
        Write-Host "Skipping frontend dependency installation." -ForegroundColor Yellow
        return
    }

    $frontendDir = Join-Path $Root "frontend"
    Write-Step "Installing frontend npm packages"
    Push-Location $frontendDir
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Step "Checking system prerequisites for YTPilot"
Install-WithWinget -Id "Python.Python.3.12" -Label "Python 3" -CommandNames @("py", "python")
Install-WithWinget -Id "OpenJS.NodeJS.LTS" -Label "Node.js LTS" -CommandNames @("node", "npm")
Install-WithWinget -Id "Gyan.FFmpeg" -Label "FFmpeg" -CommandNames @("ffmpeg", "ffprobe")

Refresh-Path

$pythonCommand = Resolve-Python
Install-PythonPackages -Root $projectRoot -PythonCommand $pythonCommand
Install-NodePackages -Root $projectRoot

Write-Step "Setup complete"
Write-Host "Dependencies are installed." -ForegroundColor Green
Write-Host "Run .\start.ps1 to launch backend and frontend." -ForegroundColor Green
