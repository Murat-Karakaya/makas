# screenrecorder


## Roadmap

### FIXME: 

The backend selection and determination logic should be all async. They cause the app to hang for quite a lot.

Flashing effect is always fullscreen in wayland. Might wanna look at transient_for property

The fallback of saving an image should be going up a parent folder. not directly jumping to $HOME

Should probably do a cleanup of the temp files

### TO DO: 

Implement a cancel button when delay is active.

Text recognition

Open image with other applications

Add Appimage, tar.gz and nix package builds.

Review area selection logic. There might be a performance issue.

terminal commands should be added

### WON'T FIX

X11 backend will only composite cursor as left pointer. This also seems to be the case for gnome-screenshot as well.

It's better to take Screenshot after the window animation is done. But I couldn't find a way to determine that.

FreeDesktop will allways flash the entire screenshot in cinnamon.

Free select won't be implemented.

## Build and Package

This project supports building as a Flatpak and Debian package (.deb).

### 1. Flatpak
You need `flatpak-builder` installed.
```bash
flatpak-builder --force-clean --user --install-deps-from=flathub --repo=repo --install builddir com.github.murat.karakaya.Makas.json
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