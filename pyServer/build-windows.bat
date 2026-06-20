@echo off
REM Build script for Windows backend executable
REM Run this on a Windows machine to build the backend exe

echo ==========================================
echo Building NeuroFeedback Backend for Windows
echo ==========================================
echo.

REM Navigate to pyServer directory
cd /d "%~dp0"

REM Check if virtual environment exists
if not exist ".venv\" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller

REM Check if database exists
if not exist "app.db" (
    echo Warning: app.db not found. Creating initial database...
    python -c "from app.core.database import Base, engine; Base.metadata.create_all(bind=engine); print('Database created')"
)

REM Clean previous builds
echo Cleaning previous builds...
if exist "build\" rmdir /s /q build
if exist "dist\" rmdir /s /q dist

REM Build the executable
echo Building executable with PyInstaller...
pyinstaller build_backend.spec

REM Check if build was successful
if exist "dist\main\main.exe" (
    echo.
    echo ========================================
    echo Build successful!
    echo ========================================
    echo.
    echo Executable location: dist\main\main.exe
    echo.
    echo To test the executable:
    echo   cd dist\main
    echo   main.exe
    echo.
) else (
    echo.
    echo Build failed! Check the output above for errors.
    exit /b 1
)

pause
