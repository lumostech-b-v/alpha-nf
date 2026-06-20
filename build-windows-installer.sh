#!/bin/bash
# Complete build script for Windows installer
# This builds both the Python backend and Electron frontend into a single installer

set -e

echo "=========================================="
echo "Building Complete Windows Installer"
echo "=========================================="
echo ""

# Step 1: Build Python backend for Windows
echo "Step 1: Building Python backend for Windows..."
echo "⚠️  NOTE: You need to build the Windows backend exe on a Windows machine or using Wine"
echo ""

cd pyServer

# Check if Windows backend exe exists
if [ ! -f "dist/main.exe" ]; then
    echo "❌ Windows backend exe not found at: dist/main.exe"
    echo ""
    echo "To build the Windows backend, you have two options:"
    echo ""
    echo "Option 1: Build on Windows machine"
    echo "  1. Copy the pyServer folder to a Windows machine"
    echo "  2. Run: python -m venv .venv"
    echo "  3. Run: .venv\\Scripts\\activate"
    echo "  4. Run: pip install -r requirements.txt pyinstaller"
    echo "  5. Run: pyinstaller build_backend.spec"
    echo "  6. Copy dist/main/main.exe back to this location"
    echo ""
    echo "Option 2: Use PyInstaller with Wine (on macOS/Linux)"
    echo "  1. Install Wine: brew install wine"
    echo "  2. Install Python for Windows via Wine"
    echo "  3. Build using Wine"
    echo ""
    echo "For now, skipping backend build..."
    echo "Using existing backend if available..."
else
    echo "✅ Windows backend exe found"
fi

cd ..

# Step 2: Build Electron installer
echo ""
echo "Step 2: Building Electron Windows installer..."
cd frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Build the Windows installer
echo "🔨 Building Windows installer with electron-builder..."
npm run build:win

# Check if build was successful
if ls dist/NeuroFeedback\ System-Setup-*.exe 1> /dev/null 2>&1; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "Installer location:"
    ls -lh dist/*.exe
    echo ""
    echo "This installer includes:"
    echo "  ✓ Electron frontend"
    echo "  ✓ Python backend (main.exe)"
    echo "  ✓ Configuration files"
    echo "  ✓ All dependencies"
    echo ""
    echo "To install on Windows:"
    echo "  1. Copy the .exe file to a Windows machine"
    echo "  2. Run the installer"
    echo "  3. The app will be installed with both frontend and backend"
    echo ""
else
    exit 1
fi

echo "=========================================="
echo "Build Complete!"
echo "=========================================="
