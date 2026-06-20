# PowerShell build script for Windows installer
# This builds the Electron frontend with the Python backend into a single installer

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Building Complete Windows Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory (project root)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Step 1: Check if backend exe exists
Write-Host "Step 1: Checking for backend executable..." -ForegroundColor Yellow
$backendExe = Join-Path $scriptPath "pyServer\dist\main\main.exe"

if (-not (Test-Path $backendExe)) {
    Write-Host "❌ Windows backend exe not found at: $backendExe" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please build the backend first:" -ForegroundColor Yellow
    Write-Host "  1. cd pyServer" -ForegroundColor Gray
    Write-Host "  2. .\build-windows.ps1" -ForegroundColor Gray
    Write-Host ""
    exit 1
} else {
    Write-Host "✅ Windows backend exe found" -ForegroundColor Green
    $exeSize = (Get-Item $backendExe).Length / 1MB
    Write-Host "   Size: $([math]::Round($exeSize, 2)) MB" -ForegroundColor Gray
}

# Step 2: Build Electron installer
Write-Host ""
Write-Host "Step 2: Building Electron Windows installer..." -ForegroundColor Yellow

$frontendPath = Join-Path $scriptPath "frontend"
Set-Location $frontendPath

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Build the Windows installer
Write-Host "🔨 Building Windows installer with electron-builder..." -ForegroundColor Yellow
npm run build:win

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed! Check the output above for errors." -ForegroundColor Red
    exit 1
}

# Check if build was successful
$installerPattern = Join-Path $frontendPath "dist\NeuroFeedback System-Setup-*.exe"
$installers = Get-ChildItem -Path $installerPattern -ErrorAction SilentlyContinue

if ($installers) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ Build successful!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer location:" -ForegroundColor Cyan
    foreach ($installer in $installers) {
        $size = $installer.Length / 1MB
        Write-Host "  $($installer.FullName)" -ForegroundColor White
        Write-Host "  Size: $([math]::Round($size, 2)) MB" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "This installer includes:" -ForegroundColor Yellow
    Write-Host "  ✓ Electron frontend" -ForegroundColor Green
    Write-Host "  ✓ Python backend (main.exe)" -ForegroundColor Green
    Write-Host "  ✓ Configuration files" -ForegroundColor Green
    Write-Host "  ✓ All dependencies" -ForegroundColor Green
    Write-Host ""
    Write-Host "To install on Windows:" -ForegroundColor Yellow
    Write-Host "  1. Run the installer .exe file" -ForegroundColor Gray
    Write-Host "  2. Follow the installation wizard" -ForegroundColor Gray
    Write-Host "  3. Launch from desktop shortcut" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Installer not found! Build may have failed." -ForegroundColor Red
    Write-Host "   Expected location: $installerPattern" -ForegroundColor Gray
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Build Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

