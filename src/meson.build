pkgdatadir = get_option('datadir') / 'com.github.murat.karakaya.Makas'
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
bin_conf.set('PACKAGE_NAME', 'com.github.murat.karakaya.Makas')
bin_conf.set('prefix', get_option('prefix'))
bin_conf.set('libdir', get_option('prefix') / get_option('libdir'))
bin_conf.set('datadir', get_option('prefix') / get_option('datadir'))
bin_conf.set('resource_path', '/com/github/Murat-Karakaya/Makas')

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
