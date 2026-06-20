#!/bin/bash
# Build script for creating the neurofeedback backend executable
# This script automates the entire build process

set -e  # Exit on error

echo "=========================================="
echo "Building Neurofeedback Backend Executable"
echo "=========================================="
echo ""

# Navigate to pyServer directory
cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Please run: python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source .venv/bin/activate

# Install PyInstaller if not already installed
echo "📦 Installing PyInstaller..."
pip install pyinstaller --quiet

# Check if database exists
if [ ! -f "app.db" ]; then
    echo "⚠️  Warning: app.db not found. Creating initial database..."
    python -c "from app.core.database import Base, engine; Base.metadata.create_all(bind=engine); print('✅ Database created')"
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf build/ dist/

# Build the executable
echo "🔨 Building executable with PyInstaller..."
pyinstaller build_backend.spec

# Check if build was successful
if [ -f "dist/main/main" ] || [ -f "dist/main/main.exe" ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "Executable location:"
    ls -lh dist/main/main* 2>/dev/null || echo "  dist/main/main"
    echo ""
    echo "To test the executable:"
    echo "  cd dist/main"
    echo "  ./main"
    echo ""
else
    echo "❌ Build failed! Check the output above for errors."
    exit 1
fi

echo "=========================================="
echo "Build Complete!"
echo "=========================================="
