@echo off
REM Batch file build script for Windows installer
REM This builds the Electron frontend with the Python backend into a single installer

echo ==========================================
echo Building Complete Windows Installer
echo ==========================================
echo.

REM Get the script directory (project root)
cd /d "%~dp0"

REM Step 1: Check if backend exe exists
echo Step 1: Checking for backend executable...
if not exist "pyServer\dist\main\main.exe" (
    echo [ERROR] Windows backend exe not found at: pyServer\dist\main\main.exe
    echo.
    echo Please build the backend first:
    echo   1. cd pyServer
    echo   2. build-windows.bat
    echo.
    pause
    exit /b 1
) else (
    echo [OK] Windows backend exe found
)

REM Step 2: Build Electron installer
echo.
echo Step 2: Building Electron Windows installer...
cd frontend

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Build the Windows installer
echo Building Windows installer with electron-builder...
call npm run build:win

if errorlevel 1 (
    echo [ERROR] Build failed! Check the output above for errors.
    pause
    exit /b 1
)

REM Check if build was successful
cd dist
dir /b "NeuroFeedback System-Setup-*.exe" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Installer not found! Build may have failed.
    echo Expected location: frontend\dist\NeuroFeedback System-Setup-*.exe
    pause
    exit /b 1
) else (
    echo.
    echo ========================================
    echo [OK] Build successful!
    echo ========================================
    echo.
    echo Installer location:
    dir /b "NeuroFeedback System-Setup-*.exe"
    echo.
    echo This installer includes:
    echo   [OK] Electron frontend
    echo   [OK] Python backend (main.exe)
    echo   [OK] Configuration files
    echo   [OK] All dependencies
    echo.
    echo To install on Windows:
    echo   1. Run the installer .exe file
    echo   2. Follow the installation wizard
    echo   3. Launch from desktop shortcut
    echo.
)

cd ..\..

echo ==========================================
echo Build Complete!
echo ==========================================
echo.
pause

