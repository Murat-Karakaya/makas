# screenrecorder


## Roadmap


### TEST:

I never confirmed that if the shell DBus is unavailable, the x11 backend will be enforced.

### FIXME: 

It's better to take Screenshot after the window animation is done. 
What we are doing here is just waiting for a bunch of miliseconds to hope the animation will be done by then.

Warn the user about how for the settings to take effect, they need to restart the app.

Either disable show pointer when area mode is selected or make it work.

### TO DO: 

Text recognition

Free select (Might never be added)

Open image with other applications

Add Appimage and nix package builds.

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