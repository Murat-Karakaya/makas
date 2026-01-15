# screenrecorder


## Roadmap


### TEST:

I never confirmed that if the shell DBus is unavailable, the x11 backend will be enforced.

### FIXME: 

Warn the user about how for the settings to take effect, they need to restart the app.

Remove window screenshot option if the backend doesn't supports it

When falling back to shell backend for window capture, make sure it always hides the main window.

There has been a case where the screenshot returned a white screen. Meaning the flash was taken before the screenshot capture. 

### TO DO: 

Add an option to disable the flash.

Text recognition

Free select (Might never be added)

Open image with other applications

Add Appimage and nix package builds.

Add images to screenshot mode options

Automatically select screenshot backend

### WON'T FIX

X11 backend will only composite cursor as left pointer. This also seems to be the case for gnome-screenshot as well.

It's better to take Screenshot after the window animation is done. But I didn't find a way to determine that.

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
This project is not exactly a fork of gnome-screenshot, but it has been inspired by it.


## License

This project is licensed under the GNU GENERAL PUBLIC LICENSE Version 3.