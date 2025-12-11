#!/bin/bash
set -e

# Compile resources
echo "Compiling resources..."
glib-compile-resources --target=src/src.gresource --sourcedir=src src/org.example.ScreenRecorder.src.gresource.xml
glib-compile-resources --target=src/data.gresource --sourcedir=src src/org.example.ScreenRecorder.data.gresource.xml

# Run application
echo "Starting application..."
gjs -m dev_runner.js "$@"
