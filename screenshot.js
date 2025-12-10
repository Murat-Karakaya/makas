const { Gtk, Gdk, GObject, GLib } = imports.gi;

var ScreenshotPage = GObject.registerClass(
    class ScreenshotPage extends Gtk.Box {
        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 20,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER
            });

            // --- UI Elements ---

            // 1. File Selection Row
            let fileBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });

            let folderLabel = new Gtk.Label({ label: "Save in:" });

            // FileChooserButton in SELECT_FOLDER mode
            this.folderBtn = new Gtk.FileChooserButton({
                title: "Select Folder",
                action: Gtk.FileChooserAction.SELECT_FOLDER
            });
            this.folderBtn.set_current_folder(GLib.get_current_dir());

            let nameLabel = new Gtk.Label({ label: "Filename:" });

            this.filenameEntry = new Gtk.Entry({
                text: "screenshot.png",
                placeholder_text: "screenshot.png"
            });

            fileBox.pack_start(folderLabel, false, false, 0);
            fileBox.pack_start(this.folderBtn, true, true, 0);
            fileBox.pack_start(nameLabel, false, false, 0);
            fileBox.pack_start(this.filenameEntry, true, true, 0);

            // 2. Control Row
            let controlBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10 });

            this.shootBtn = new Gtk.Button({ label: "Take Screenshot" });
            this.statusLabel = new Gtk.Label({ label: "Status: Idle" });

            controlBox.pack_start(this.shootBtn, false, false, 0);
            controlBox.pack_start(this.statusLabel, false, false, 0);

            this.add(fileBox);
            this.add(controlBox);

            // --- Logic ---
            this.shootBtn.connect('clicked', () => {
                this._takeScreenshot();
            });
        }

        _getDestinationPath() {
            let folder = this.folderBtn.get_filename();
            let name = this.filenameEntry.get_text();
            if (!folder || !name) return null;
            if (!folder.endsWith("/")) folder += "/";
            return folder + name;
        }

        _takeScreenshot() {
            let filepath = this._getDestinationPath();
            if (!filepath) {
                this.statusLabel.set_text("Error: Invalid path or filename");
                return;
            }

            // Hide window momentarily? 
            // Often users want the app to disappear. But that's complicated with async.
            // For now, we just capture.

            try {
                let window = Gdk.get_default_root_window();
                let w = window.get_width();
                let h = window.get_height();

                // Gdk.pixbuf_get_from_window is the standard Gtk3 way
                // If this fails, we might need GdkPixbuf.Pixbuf.get_from_window depending on binding version
                let pixbuf = Gdk.pixbuf_get_from_window(window, 0, 0, w, h);

                if (pixbuf) {
                    // savev(filename, type, option_keys, option_values)
                    pixbuf.savev(filepath, "png", [], []);
                    this.statusLabel.set_text("Saved to " + filepath);
                } else {
                    this.statusLabel.set_text("Error: Failed to capture pixbuf");
                }
            } catch (e) {
                print("Screenshot error: " + e.message);
                this.statusLabel.set_text("Error: " + e.message);
            }
        }
    }
);
