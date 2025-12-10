const { Gtk, Gst, Gio, GObject, GLib } = imports.gi;

var RecorderPage = GObject.registerClass(
    class RecorderPage extends Gtk.Box {
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
            // Set default current folder
            this.folderBtn.set_current_folder(GLib.get_current_dir());

            let nameLabel = new Gtk.Label({ label: "Filename:" });

            this.filenameEntry = new Gtk.Entry({
                text: 'recording.mp4',
                placeholder_text: 'recording.mp4'
            });

            fileBox.pack_start(folderLabel, false, false, 0);
            fileBox.pack_start(this.folderBtn, true, true, 0);
            fileBox.pack_start(nameLabel, false, false, 0);
            fileBox.pack_start(this.filenameEntry, true, true, 0);

            // 2. Control Row
            let controlBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10 });

            this.recordBtn = new Gtk.Button({ label: "Start Recording" });
            this.statusLabel = new Gtk.Label({ label: "Status: Idle" });

            controlBox.pack_start(this.recordBtn, false, false, 0);
            controlBox.pack_start(this.statusLabel, false, false, 0);

            // Add to main container
            this.add(fileBox);
            this.add(controlBox);

            // --- Logic ---
            this.pipeline = null;
            this.isRecording = false;

            this.recordBtn.connect('clicked', () => {
                if (!this.isRecording) {
                    this._startRecording();
                } else {
                    this._stopRecording();
                }
            });
        }

        _getDestinationPath() {
            let folder = this.folderBtn.get_filename(); // Returns absolute path
            let name = this.filenameEntry.get_text();
            if (!folder || !name) return null;
            // Ensure separator
            if (!folder.endsWith("/")) folder += "/";
            return folder + name;
        }

        _startRecording() {
            let filepath = this._getDestinationPath();
            if (!filepath) {
                this.statusLabel.set_text("Error: Invalid path or filename");
                return;
            }

            if (this.pipeline) {
                this.pipeline.set_state(Gst.State.NULL);
                this.pipeline = null;
            }

            // Using ximagesrc for X11 recording
            // queue is important to prevent blocking the pipeline
            const pipelineStr = `ximagesrc ! videoconvert ! queue ! x264enc ! mp4mux ! filesink location="${filepath}"`;

            try {
                this.pipeline = Gst.parse_launch(pipelineStr);

                let bus = this.pipeline.get_bus();
                bus.add_signal_watch();
                bus.connect('message', (bus, msg) => {
                    this._onBusMessage(msg);
                });

                let ret = this.pipeline.set_state(Gst.State.PLAYING);
                if (ret === Gst.StateChangeReturn.FAILURE) {
                    print("Unable to set the pipeline to the playing state.");
                    this.statusLabel.set_text("Status: Error starting");
                    this.pipeline = null;
                    return;
                }

                this.isRecording = true;
                this.recordBtn.set_label("Stop Recording");
                this.statusLabel.set_text("Status: Recording... " + filepath);

            } catch (e) {
                print("Error creating pipeline: " + e.message);
                this.statusLabel.set_text("Error: " + e.message);
            }
        }

        _stopRecording() {
            if (!this.pipeline) return;

            this.statusLabel.set_text("Status: Stopping...");
            this.recordBtn.set_sensitive(false);

            let event = Gst.Event.new_eos();
            this.pipeline.send_event(event);
        }

        _onBusMessage(msg) {
            switch (msg.type) {
                case Gst.MessageType.EOS:
                    print("End of stream");
                    this._cleanup();
                    this.statusLabel.set_text("Status: Saved.");
                    break;
                case Gst.MessageType.ERROR:
                    let [err, debug] = msg.parse_error();
                    print("Error: " + err.message);
                    this._cleanup();
                    this.statusLabel.set_text("Error: " + err.message);
                    break;
            }
        }

        _cleanup() {
            if (this.pipeline) {
                this.pipeline.set_state(Gst.State.NULL);
                this.pipeline = null;
            }
            this.isRecording = false;
            this.recordBtn.set_label("Start Recording");
            this.recordBtn.set_sensitive(true);
        }
    }
);
