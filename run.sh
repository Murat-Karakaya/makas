#!/bin/bash
set -e

# Compile resources
echo "Compiling resources..."
glib-compile-resources --target=src/src.gresource --sourcedir=src src/org.x.Makas.src.gresource.xml
glib-compile-resources --target=src/data.gresource --sourcedir=src src/org.x.Makas.data.gresource.xml

# Run application
# Compile schemas
echo "Compiling schemas..."
glib-compile-schemas data/

# Run application
echo "Starting application..."
GSETTINGS_SCHEMA_DIR=data gjs -m dev_runner.js "$@"
