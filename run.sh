#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/builddir"

# Initialize flags
SKIP_BUILD=false
USE_WAYLAND=false

# Parse arguments
while getopts "rw" opt; do
  case $opt in
    r) SKIP_BUILD=true ;;
    w) USE_WAYLAND=true ;;
    *) echo "Usage: $0 [-r] [-w]"; exit 1 ;;
  esac
done

# Shift off the options so "$@" only contains remaining script arguments
shift $((OPTIND-1))

if [ "$SKIP_BUILD" = false ]; then
    # Build the C library with meson
    echo "Building C library..."
    if [ ! -d "$BUILD_DIR" ]; then
        meson setup "$BUILD_DIR" "$SCRIPT_DIR"
    fi
    meson compile -C "$BUILD_DIR"

    # Compile resources
    echo "Compiling resources..."
    glib-compile-resources --target=src/src.gresource --sourcedir=src src/org.x.Makas.src.gresource.xml
    glib-compile-resources --target=src/data.gresource --sourcedir=src src/org.x.Makas.data.gresource.xml

    # Compile schemas
    echo "Compiling schemas..."
    glib-compile-schemas data/
else
    echo "Skipping compilation steps..."
fi

# Set up environment for the C library
export LD_LIBRARY_PATH="${BUILD_DIR}/lib:${LD_LIBRARY_PATH}"
export GI_TYPELIB_PATH="${BUILD_DIR}/lib:${GI_TYPELIB_PATH}"

# Add Wayland env if requested
if [ "$USE_WAYLAND" = true ]; then
    echo "Enabling Wayland display..."
    export WAYLAND_DISPLAY=wayland-2
    export GDK_BACKEND=wayland
fi

# Run application
echo "Starting application..."
GSETTINGS_SCHEMA_DIR=data gjs -m dev_runner.js "$@"