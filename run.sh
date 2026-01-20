#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/builddir"
INSTALL_DIR="${BUILD_DIR}/install"

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
    echo "Building and installing..."
    
    # Configure with prefix to local install directory
    if [ ! -d "$BUILD_DIR" ]; then
        meson setup "$BUILD_DIR" "$SCRIPT_DIR" --prefix="$INSTALL_DIR" --libdir=lib
    else
        # Reconfigure if needed (optional but good practice if prefix changed, 
        # but meson usually handles it. Explicit reconfigure is safer if switching modes)
        meson configure "$BUILD_DIR" --prefix="$INSTALL_DIR" -Dlibdir=lib
    fi
    
    # Compile
    meson compile -C "$BUILD_DIR"
    
    # Install to the local directory
    meson install -C "$BUILD_DIR"
else
    echo "Skipping compilation steps..."
fi

# Set up environment to run from the install directory
export MAKAS_PREFIX="${INSTALL_DIR}"
export MAKAS_LIBDIR="${INSTALL_DIR}/lib"
export MAKAS_DATADIR="${INSTALL_DIR}/share"

export XDG_DATA_DIRS="${INSTALL_DIR}/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export LD_LIBRARY_PATH="${INSTALL_DIR}/lib:${LD_LIBRARY_PATH}"
export GI_TYPELIB_PATH="${INSTALL_DIR}/lib/girepository-1.0:${GI_TYPELIB_PATH}"
export GSETTINGS_SCHEMA_DIR="${INSTALL_DIR}/share/glib-2.0/schemas"

# Add Wayland env if requested
if [ "$USE_WAYLAND" = true ]; then
    echo "Enabling Wayland display..."
    export WAYLAND_DISPLAY=wayland-2
    export GDK_BACKEND=wayland
fi

# Run the installed application wrapper
echo "Starting application..."
"${INSTALL_DIR}/bin/com.github.murat.karakaya.Makas" "$@"
