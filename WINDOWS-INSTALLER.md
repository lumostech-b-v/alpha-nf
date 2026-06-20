# Building Windows Installer - Complete Guide

## Overview

This project creates **ONE single Windows installer** that includes:
- ✅ Electron frontend (UI)
- ✅ Python FastAPI backend (server)
- ✅ SQLite database
- ✅ All configuration files

The installer is built using **electron-builder** with **NSIS** (Nullsoft Scriptable Install System).

## Build Process

### Step 1: Build Python Backend for Windows

**⚠️ IMPORTANT**: The Python backend must be built **on a Windows machine** because PyInstaller creates platform-specific executables.

#### Option A: Build on Windows Machine (Recommended)

1. **Copy the `pyServer` folder to a Windows machine**

2. **Run the build script**:
   ```cmd
   cd pyServer
   build-windows.bat
   ```

3. **Verify the build**:
   - Check that `pyServer/dist/main/main.exe` exists
   - Size should be ~40-50 MB

4. **Copy back to your Mac** (if building on different machine):
   - Copy `pyServer/dist/main/main.exe` back to the same location on your Mac

#### Option B: Cross-compile from macOS (Advanced)

Using Wine to run Windows Python:
```bash
# Install Wine
brew install wine-stable

# Install Python for Windows via Wine
# Then build using Wine
# (This is complex and not recommended)
```

### Step 2: Build Complete Windows Installer

Once you have the Windows backend exe at `pyServer/dist/main/main.exe`:

```bash
# From project root
./build-windows-installer.sh
```

Or manually:
```bash
cd frontend
npm install
npm run build:win
```

### Step 3: Find Your Installer

The installer will be created at:
```
frontend/dist/NeuroFeedback System-Setup-1.0.0.exe
```

This is **ONE single file** that contains everything!

## What Gets Installed

When a user runs the installer on Windows:

1. **Installation wizard** appears (NSIS installer)
2. User chooses installation directory (default: `C:\Program Files\NeuroFeedback System`)
3. Installer extracts:
   - Electron app → `NeuroFeedback System.exe`
   - Python backend → `resources\backend\main.exe`
   - Config files → `resources\backend\config.json`
   - Database → `resources\backend\app.db` (created on first run)
4. Desktop shortcut created
5. Start menu entry created

## How It Works

### When User Launches the App

1. User double-clicks `NeuroFeedback System.exe` (Electron app)
2. Electron's `main.js` automatically starts the backend:
   - Looks for backend at `resources/backend/main.exe`
   - Starts the Python server on port 8000
   - Backend creates/opens database at `resources/backend/app.db`
3. Frontend connects to `http://localhost:8000`
4. User sees the UI and everything works!

### When User Closes the App

1. Electron closes
2. Backend process is automatically terminated
3. Database is saved

## Configuration Files

### package.json (Frontend)

```json
{
  "build": {
    "appId": "com.neurofeedback.app",
    "productName": "NeuroFeedback System",
    "extraResources": [
      {
        "from": "../pyServer/dist/main/main.exe",
        "to": "backend/main.exe"
      },
      {
        "from": "../pyServer/config.json",
        "to": "backend/config.json"
      }
    ],
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    }
  }
}
```

### build_backend.spec (Backend)

PyInstaller configuration that bundles:
- FastAPI + uvicorn
- SQLAlchemy
- All app modules
- Signal processing libraries
- Config files

## Testing the Installer

### On Windows Machine

1. **Copy the installer** to Windows machine
2. **Run the installer**: `NeuroFeedback System-Setup-1.0.0.exe`
3. **Follow installation wizard**
4. **Launch the app** from desktop shortcut
5. **Verify**:
   - App window opens
   - Backend starts (you'll see console if debugging enabled)
   - Can create patients, sessions, etc.
   - Database persists between runs

### Debugging

If the app doesn't work:

1. **Check backend logs**:
   - Location: `C:\Program Files\NeuroFeedback System\resources\backend\backend.log`

2. **Check if backend is running**:
   - Open browser: `http://localhost:8000/health`
   - Should see: `{"status": "ok"}`

3. **Enable console** (already done):
   - Backend console window shows errors
   - Check `main.js` line 296: `windowsHide: false`

## File Structure in Installer

```
NeuroFeedback System-Setup-1.0.0.exe (Single installer file)
└── When installed:
    ├── NeuroFeedback System.exe (Electron app)
    ├── resources/
    │   ├── app.asar (Frontend code)
    │   └── backend/
    │       ├── main.exe (Python backend)
    │       ├── config.json
    │       └── app.db (created on first run)
    └── [other Electron files]
```

## Build Scripts

- **`pyServer/build-windows.bat`** - Build backend on Windows
- **`pyServer/build.sh`** - Build backend on macOS/Linux  
- **`build-windows-installer.sh`** - Build complete installer
- **`frontend/package.json`** - Electron-builder config

## Common Issues

### Issue: "Backend exe not found"
**Solution**: Build the Windows backend first using `build-windows.bat` on a Windows machine.

### Issue: "Installer build fails"
**Solution**: Make sure `pyServer/dist/main/main.exe` exists before building installer.

### Issue: "Backend doesn't start"
**Solution**: Check `backend.log` in the installation directory.

### Issue: "Database not persisting"
**Solution**: Database is saved in `resources/backend/app.db` - this is now correctly configured.

## Distribution

To distribute your app:

1. **Build the installer** (following steps above)
2. **Upload** `NeuroFeedback System-Setup-1.0.0.exe` to your distribution platform
3. **Users download** the single .exe file
4. **Users run** the installer
5. **Done!** Everything is installed and configured

## Version Updates

To release a new version:

1. Update version in `frontend/package.json`
2. Rebuild backend if needed
3. Rebuild installer
4. New file: `NeuroFeedback System-Setup-X.Y.Z.exe`

## Summary

✅ **One installer file** - Everything bundled together  
✅ **Easy distribution** - Single .exe to share  
✅ **Professional** - NSIS installer with wizard  
✅ **Complete** - Frontend + Backend + Database  
✅ **Persistent** - Data saved between runs  
✅ **Automatic** - Backend starts/stops automatically  

The installer size will be approximately **60-80 MB** (Electron ~40MB + Python backend ~40MB + dependencies).
