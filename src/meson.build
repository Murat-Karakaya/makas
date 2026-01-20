pkgdatadir = get_option('datadir') / meson.project_name()
gnome = import('gnome')

src_res = gnome.compile_resources('com.github.murat.karakaya.Makas.src',
  'com.github.murat.karakaya.Makas.src.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

data_res = gnome.compile_resources('com.github.murat.karakaya.Makas.data',
  'com.github.murat.karakaya.Makas.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

bin_conf = configuration_data()
bin_conf.set('GJS', find_program('gjs').full_path())
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', meson.project_name())

# Inject JS logic for relocatable paths via env vars, falling back to build-time paths
# We use format() to insert the build-time paths as quoted strings into the JS code snippet
prefix_path = get_option('prefix')
libdir_path = get_option('prefix') / get_option('libdir')
datadir_path = get_option('prefix') / get_option('datadir')

bin_conf.set('prefix', 'GLib.getenv("MAKAS_PREFIX") || "@0@"'.format(prefix_path))
bin_conf.set('libdir', 'GLib.getenv("MAKAS_LIBDIR") || "@0@"'.format(libdir_path))
bin_conf.set('datadir', 'GLib.getenv("MAKAS_DATADIR") || "@0@"'.format(datadir_path))

bin_conf.set('libdir_name', get_option('libdir'))
bin_conf.set('datadir_name', get_option('datadir'))
bin_conf.set('resource_path', '/com/github/murat/karakaya/Makas')

configure_file(
  input: 'com.github.murat.karakaya.Makas.in',
  output: 'com.github.murat.karakaya.Makas',
  configuration: bin_conf,
  install: true,
  install_dir: get_option('bindir')
)

install_symlink('makas',
  pointing_to: 'com.github.murat.karakaya.Makas',
  install_dir: get_option('bindir')
)
