# lib/meson.build - Build configuration for libmakas-screenshot

gnome = import('gnome')

# Dependencies
glib_dep = dependency('glib-2.0')
gobject_dep = dependency('gobject-2.0')
gdk_dep = dependency('gdk-3.0')
gdk_pixbuf_dep = dependency('gdk-pixbuf-2.0')
gtk_dep = dependency('gtk+-3.0')
x11_dep = dependency('x11')
xext_dep = dependency('xext')
xcomposite_dep = dependency('xcomposite')
dl_dep = meson.get_compiler('c').find_library('dl')

lib_sources = [
  'makas-screenshot.c',
  'makas-utils.c',
]

lib_headers = [
  'makas-screenshot.h',
  'makas-utils.h',
]

# Build shared library
libmakas_screenshot = shared_library('makas-screenshot',
  lib_sources,
  dependencies: [glib_dep, gobject_dep, gdk_dep, gdk_pixbuf_dep, gtk_dep, x11_dep, xext_dep, xcomposite_dep, dl_dep],
  install: true,
  install_dir: get_option('libdir'),
)

# Install headers
install_headers(lib_headers, subdir: 'makas-screenshot')

# Generate GObject Introspection data
makas_gir = gnome.generate_gir(libmakas_screenshot,
  sources: lib_sources + lib_headers,
  namespace: 'MakasScreenshot',
  nsversion: '1.0',
  identifier_prefix: 'Makas',
  symbol_prefix: 'makas',
  includes: ['GObject-2.0', 'GdkPixbuf-2.0', 'Gdk-3.0'],
  install: true,
)

# Make typelib available for development runs
# The typelib will be installed to the standard location
