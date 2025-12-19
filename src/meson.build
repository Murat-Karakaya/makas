pkgdatadir = get_option('datadir') / 'org.x.Makas'
gnome = import('gnome')

src_res = gnome.compile_resources('org.x.Makas.src',
  'org.x.Makas.src.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

data_res = gnome.compile_resources('org.x.Makas.data',
  'org.x.Makas.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

bin_conf = configuration_data()
bin_conf.set('GJS', find_program('gjs').full_path())
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', 'org.x.Makas')
bin_conf.set('prefix', get_option('prefix'))
bin_conf.set('libdir', get_option('prefix') / get_option('libdir'))
bin_conf.set('datadir', get_option('prefix') / get_option('datadir'))
bin_conf.set('resource_path', '/com/github/Murat-Karakaya/Makas')

configure_file(
  input: 'org.x.Makas.in',
  output: 'org.x.Makas',
  configuration: bin_conf,
  install: true,
  install_dir: get_option('bindir')
)

install_symlink('makas',
  pointing_to: 'org.x.Makas',
  install_dir: get_option('bindir')
)
