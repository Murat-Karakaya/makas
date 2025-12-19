#!/bin/bash

# Exit on error
set -e

# Determine directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_NAME="makas"
VERSION="0.1.0"
DEB_NAME="${APP_NAME}_${VERSION}_amd64"
BUILD_DIR="${PROJECT_ROOT}/build"
PKG_DIR="${PROJECT_ROOT}/pkg-deb"

echo "Building .deb package for ${APP_NAME} v${VERSION}..."
echo "Project Root: ${PROJECT_ROOT}"

# Clean up previous builds
rm -rf "$BUILD_DIR" "$PKG_DIR"

# Configure and build
# Explicitly pass build dir and source dir (project root) to meson
meson setup "$BUILD_DIR" "$PROJECT_ROOT" --prefix=/usr
meson compile -C "$BUILD_DIR"

# Install to temp directory
DESTDIR="$PKG_DIR" meson install -C "$BUILD_DIR"

# Create DEBIAN directory
mkdir -p "$PKG_DIR/DEBIAN"

# Create control file
cat <<EOF > "$PKG_DIR/DEBIAN/control"
Package: ${APP_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Murat Karakaya
Depends: gjs, libgtk-3-0, gir1.2-gtk-3.0, gir1.2-wnck-3.0, gir1.2-gdkpixbuf-2.0
Description: A simple screen recorder and screenshot tool.
EOF

# Build the package
dpkg-deb --build "$PKG_DIR" "${PROJECT_ROOT}/${DEB_NAME}.deb"

echo "Successfully built ${PROJECT_ROOT}/${DEB_NAME}.deb"
