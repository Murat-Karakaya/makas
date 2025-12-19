# screenrecorder


## Roadmap

### FIXME: 

It's better to take Screenshot after the window animation is done. 
What we are doing here is just waiting for 300 ms to hope the animation will be done by then.

Window capture doesn't work for apps with decorations as expected. the header doesn't show up. and a black bar is below the main window.

### DO CLEANUP: 

Dechain _StartDelay and _PerformScreenshot

### TODO: 

Text recognition

Free select (Might never be added)

Add package builds

Open image with other applications

Change exec for debs to be `makas` instead of `org.x.Makas`


## Build and Package

This project supports building as a Flatpak, Debian package (.deb), and AppImage.

### 1. Flatpak
You need `flatpak-builder` installed.
```bash
flatpak-builder --force-clean --user --install-deps-from=flathub --repo=repo --install builddir org.x.Makas.json
```

### 2. Debian Package (.deb)
Run the provided script to build a `.deb` package.
```bash
chmod +x ./scripts/build-deb.sh
./scripts/build-deb.sh
```
The resulting package will be named `makas_0.1.0_amd64.deb`.

## Development
To run the app in development mode:
```bash
./run.sh
```