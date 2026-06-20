# PowerShell build script for Windows backend executable
# Run this in PowerShell to build the backend exe

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Building NeuroFeedback Backend for Windows" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to pyServer directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if virtual environment exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".venv\Scripts\Activate.ps1"

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt
pip install pyinstaller

# Check if database exists
if (-not (Test-Path "app.db")) {
    Write-Host "Warning: app.db not found. Creating initial database..." -ForegroundColor Yellow
    python -c "from app.core.database import Base, engine; Base.metadata.create_all(bind=engine); print('Database created')"
}

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "build") {
    Remove-Item -Recurse -Force "build"
}
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

# Build the executable
Write-Host "Building executable with PyInstaller..." -ForegroundColor Yellow
pyinstaller build_backend.spec

# Check if build was successful
if (Test-Path "dist\main\main.exe") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Executable location: dist\main\main.exe" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To test the executable:" -ForegroundColor Yellow
    Write-Host "  cd dist\main" -ForegroundColor Gray
    Write-Host "  .\main.exe" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Build failed! Check the output above for errors." -ForegroundColor Red
    exit 1
}

Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")


