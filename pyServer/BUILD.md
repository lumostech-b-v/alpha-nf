# Backend Build Instructions

## Quick Start

To build the backend executable:

```bash
cd pyServer
./build.sh
```

The executable will be created at: `pyServer/dist/main/main.exe` (or `main` on macOS/Linux)

## Prerequisites

1. **Python Virtual Environment**
   ```bash
   cd pyServer
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **PyInstaller**
   ```bash
   pip install pyinstaller
   ```

## Manual Build Process

If you prefer to build manually:

```bash
cd pyServer
pyinstaller build_backend.spec
```

## What Gets Built

The build process creates a standalone executable that includes:
- FastAPI backend server
- SQLite database (app.db)
- All Python dependencies
- Configuration files (config.json)
- Signal processing modules
- Device handlers

## Testing the Executable

### Test Standalone
```bash
cd pyServer/dist/main
./main  # or main.exe on Windows
```

The backend should start on port 8000. You should see:
- Console output showing "Database path: ..."
- "Logging to file: ..."
- Uvicorn server starting
- "Application startup complete"

### Check Logs
If the exe closes immediately, check:
1. `backend.log` in the same directory as the exe
2. Console output (now visible for debugging)

### Test with Electron
```bash
cd frontend
npm run build
```

## Common Issues

### Issue: "Database file not found"
**Solution**: The database path is now automatically detected. Check `backend.log` for the actual path being used.

### Issue: "Port 8000 already in use"
**Solution**: Stop any other process using port 8000 or set the PORT environment variable:
```bash
PORT=8001 ./main
```

### Issue: "Module not found"
**Solution**: The PyInstaller spec file includes all necessary modules. If you added new dependencies, update `build_backend.spec` hiddenimports list.

### Issue: "Config file not found"
**Solution**: Make sure `config.json` exists in the pyServer directory before building.

## Build Configuration

The build is configured in `build_backend.spec`:
- **Console mode**: Enabled for debugging (shows errors)
- **Hidden imports**: All FastAPI, SQLAlchemy, and app modules
- **Data files**: config.json, app.db
- **Excluded**: matplotlib, tkinter (not needed)

## Deployment

After building successfully:

1. The exe is automatically copied to the Electron app during `npm run build`
2. Location in Electron: `resources/backend/main.exe`
3. The Electron app will start this exe automatically

## Troubleshooting

Enable detailed logging:
```bash
LOG_LEVEL=DEBUG ./main
```

Check what's included in the build:
```bash
cd pyServer/dist/main
ls -la
```

## Next Steps

After successful build:
1. Test the exe standalone
2. Build the Electron app: `cd frontend && npm run build`
3. Test the full application
4. Create installer: `cd frontend && npm run dist`
