# screenrecorder


## Roadmap

### FIXME: 

When falling back to shell backend for window capture, make sure it always hides the main window.

Fix GRIM check

The backend selection and determination logic should be all async. They cause the app to hang for quite a lot.

### TO DO: 

Implement a cancel button when delay is active.

Text recognition

Free select (Might never be added)

Open image with other applications

Add Appimage and nix package builds.

Warn the user about how for the settings to take effect, they need to restart the app.

### WON'T FIX

X11 backend will only composite cursor as left pointer. This also seems to be the case for gnome-screenshot as well.

It's better to take Screenshot after the window animation is done. But I couldn't find a way to determine that.

FreeDesktop will allways flash the entire screenshot in cinnamon.

## Build and Package

This project supports building as a Flatpak and Debian package (.deb).

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
The resulting package will be named `makas_x.x.x_amd64.deb`.

## Development
To run the app in development mode:
```bash
./run.sh
```


## Credits

The open source codebase of the gnome-screenshot has significantly helped the making of this project.
This project is not exactly a fork of gnome-screenshot, but it has been inspired by it. Some images and 
functions has been used from gnome-screenshot.


## License

This project is licensed under the GNU GENERAL PUBLIC LICENSE Version 3.