import Gtk from 'gi://Gtk?version=3.0';
import Gst from 'gi://Gst';
import GObject from 'gi://GObject';

import { settings } from '../window.js';
import { getCurrentDate } from '../utils.js';

export const RecorderPage = GObject.registerClass(
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
            const fileGrid = new Gtk.Grid({
                row_spacing: 12,
                column_spacing: 12,
            });

            const folderLabel = new Gtk.Label({ label: "Save in:" });

            // FileChooserButton in SELECT_FOLDER mode
            this.folderBtn = new Gtk.FileChooserButton({
                title: "Select Folder",
                action: Gtk.FileChooserAction.SELECT_FOLDER
            });
            // Set default current folder
            this.folderBtn.set_current_folder(settings.get_string('default-recorder-folder'));

            const nameLabel = new Gtk.Label({ label: "Filename:" });

            this.filenameEntry = new Gtk.Entry({
                text: `recording-${getCurrentDate()}.mp4`,
                placeholder_text: "recording.mp4",
                width_chars: 35
            });

            fileGrid.attach(folderLabel, 0, 0, 1, 1);
            fileGrid.attach(this.folderBtn, 1, 0, 1, 1);
            fileGrid.attach(nameLabel, 0, 1, 1, 1);
            fileGrid.attach(this.filenameEntry, 1, 1, 1, 1);

            // 2. Control Row
            const controlBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10 });

            this.recordBtn = new Gtk.Button({ label: "Start Recording" });
            this.statusLabel = new Gtk.Label({ label: "Status: Idle" });

            controlBox.pack_start(this.recordBtn, false, false, 0);
            controlBox.pack_start(this.statusLabel, false, false, 0);

            // Add to main container
            this.add(fileGrid);
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
            const name = this.filenameEntry.get_text();
            if (!folder || !name) return null;
            // Ensure separator
            if (!folder.endsWith("/")) folder += "/";
            return folder + name;
        }

        _startRecording() {
            const filepath = this._getDestinationPath();
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

                const bus = this.pipeline.get_bus();
                bus.add_signal_watch();
                bus.connect('message', (bus, msg) => {
                    this._onBusMessage(msg);
                });

                const ret = this.pipeline.set_state(Gst.State.PLAYING);
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

            const event = Gst.Event.new_eos();
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
                    const [err, debug] = msg.parse_error();
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
