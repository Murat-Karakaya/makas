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
m_dep = meson.get_compiler('c').find_library('m')
wayland_client_dep = dependency('wayland-client')
wayland_protos_dep = dependency('wayland-protocols', version: '>=1.37')
pixman_dep = dependency('pixman-1')

wl_protocol_dir = wayland_protos_dep.get_variable('pkgdatadir')

wayland_scanner_dep = dependency('wayland-scanner', version: '>=1.14.91', native: true)
wayland_scanner_path = wayland_scanner_dep.get_variable(pkgconfig: 'wayland_scanner')
wayland_scanner_prog = find_program(wayland_scanner_path, native: true)

wayland_scanner_code = generator(
  wayland_scanner_prog,
  output: '@BASENAME@-protocol.c',
  arguments: ['private-code', '@INPUT@', '@OUTPUT@'],
)

wayland_scanner_client = generator(
  wayland_scanner_prog,
  output: '@BASENAME@-protocol.h',
  arguments: ['client-header', '@INPUT@', '@OUTPUT@'],
)

protocols = [
  wl_protocol_dir / 'staging/ext-foreign-toplevel-list/ext-foreign-toplevel-list-v1.xml',
  wl_protocol_dir / 'staging/ext-image-capture-source/ext-image-capture-source-v1.xml',
  wl_protocol_dir / 'staging/ext-image-copy-capture/ext-image-copy-capture-v1.xml',
  wl_protocol_dir / 'unstable/xdg-output/xdg-output-unstable-v1.xml',
  meson.project_source_root() / 'lib/protocols/wlr-screencopy-unstable-v1.xml',
]

protocols_src = []
foreach xml : protocols
  protocols_src += wayland_scanner_code.process(xml)
  protocols_src += wayland_scanner_client.process(xml)
endforeach

lib_sources = [
  'makas-screenshot.c',
  'makas-utils.c',
  'makas-grim.c',
]

lib_headers = [
  'makas-screenshot.h',
  'makas-utils.h',
  'makas-grim.h',
]

# Build shared library
libmakas_screenshot = shared_library('makas-screenshot',
  lib_sources + protocols_src,
  dependencies: [glib_dep, gobject_dep, gdk_dep, gdk_pixbuf_dep, gtk_dep, x11_dep, xext_dep, xcomposite_dep, dl_dep, m_dep, wayland_client_dep, pixman_dep],
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
