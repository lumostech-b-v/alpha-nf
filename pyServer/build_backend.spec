# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for building the neurofeedback backend executable.

This spec file includes all necessary dependencies, data files, and hidden imports
required for the FastAPI backend to run as a standalone executable.

Build command:
    cd pyServer
    pyinstaller build_backend.spec

Output:
    dist/main/main.exe (or main on macOS/Linux)
"""

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all submodules for packages that use dynamic imports
hiddenimports = [
    # Uvicorn and ASGI server components
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.wsproto_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    
    # FastAPI and dependencies
    'fastapi',
    'starlette',
    'pydantic',
    
    # SQLAlchemy and database
    'sqlalchemy',
    'sqlalchemy.ext.declarative',
    'sqlalchemy.orm',
    'sqlalchemy.sql',
    'sqlalchemy.sql.default_comparator',
    
    # Application modules
    'app.core.main',
    'app.core.database',
    'app.core.migrations',
    'app.users.routes',
    'app.users.models',
    'app.users.crud',
    'app.users.schemas',
    'app.patients.routes',
    'app.patients.models',
    'app.patients.crud',
    'app.patients.schemas',
    'app.sessions.routes',
    'app.sessions.models',
    'app.sessions.crud',
    'app.sessions.schemas',
    'app.protocols.routes',
    'app.protocols.models',
    'app.protocols.crud',
    'app.protocols.schemas',
    'app.planning.routes',
    'app.planning.models',
    'app.planning.crud',
    'app.planning.schemas',
    
    # Signal processing modules
    'signal_processing.sp_routes',
    'signal_processing.live_pipeline',
    'signal_processing.features',
    'signal_processing.preprocessing',
    'signal_processing.feedback',
    'signal_processing.normalization',
    'signal_processing.smoothing',
    'signal_processing.artifact',
    'signal_processing.acquisition',
    'signal_processing.device_acquisition',
    'signal_processing.config',
    
    # Device handlers
    'device_handlers.device_manager',
    'device_handlers.eeg_data_collector',
    'device_handlers.mock_device',
    
    # Password hashing
    'passlib.handlers.bcrypt',
    'passlib.handlers.pbkdf2',
    'passlib.context',
    
    # Email validation
    'email_validator',
    
    # JWT
    'jwt',
    
    # Websockets
    'websockets',
    'websockets.legacy',
    'websockets.legacy.server',
    
    # Scientific computing
    'numpy',
    'scipy',
    'scipy.signal',
    'pandas',
    
    # Serial communication
    'serial',
]

# Data files to include
datas = [
    ('config.json', '.'),  # Configuration file
    ('device_handlers/I8Library1.dll', 'device_handlers'), # Include DLL
    ('../protocols', 'protocols'),  # Protocol JSON definitions
]

# Try to include the database if it exists
if os.path.exists('app.db'):
    datas.append(('app.db', '.'))
    print("Including existing app.db")
else:
    print("Warning: app.db not found, will be created on first run")

a = Analysis(
    ['app/core/main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',  # Exclude if not needed in production
        'tkinter',     # GUI library not needed
        'PIL',         # Image processing not needed
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # IMPORTANT: Keep console visible to see errors during debugging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Add icon path if you have one
)
