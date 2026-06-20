# Quick Start: Building Windows Installer

## TL;DR

You want **ONE .exe file** that installs both frontend and backend on Windows.

## Steps

### 1. Build Windows Backend (on Windows machine)

```cmd
cd pyServer
build-windows.bat
```

**Result**: `pyServer/dist/main/main.exe`

### 2. Build Complete Installer

```bash
./build-windows-installer.sh
```

**Result**: `frontend/dist/NeuroFeedback System-Setup-1.0.0.exe`

### 3. Distribute

Share the single installer file. Users run it, and everything is installed!

## What You Get

- ✅ One installer file (~60-80 MB)
- ✅ Includes Electron frontend + Python backend
- ✅ Professional NSIS installer with wizard
- ✅ Desktop and Start Menu shortcuts
- ✅ Backend starts automatically
- ✅ Database persists

## Important Notes

⚠️ **Backend must be built on Windows** (PyInstaller is platform-specific)

✅ **Frontend can be built on any platform** (electron-builder supports cross-platform)

## Files Created

- `pyServer/build-windows.bat` - Build backend on Windows
- `build-windows-installer.sh` - Build complete installer
- `WINDOWS-INSTALLER.md` - Full documentation
- Updated `frontend/package.json` - Installer configuration

## Need Help?

See [WINDOWS-INSTALLER.md](file:///Users/farhadfirozitabar/Documents/neuro-feedback/WINDOWS-INSTALLER.md) for complete guide.
