#!/usr/bin/env gjs

imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gst = '1.0';

const { Gtk, Gdk, Gst, GObject, GLib } = imports.gi;

// Initialize GStreamer early
Gst.init(null);

const ScreenRecorderApp = GObject.registerClass(
    class ScreenRecorderApp extends Gtk.Application {
        _init() {
            super._init({
                application_id: 'org.example.ScreenRecorder',
                flags: Gio.ApplicationFlags.FLAGS_NONE
            });
        }

        vfunc_activate() {
            let win = new Gtk.ApplicationWindow({
                application: this,
                default_width: 600,
                default_height: 400,
                title: "GJS Recorder"
            });

            // Main container
            let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            win.add(vbox);

            // Stack Switcher
            let stack = new Gtk.Stack({
                transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT
            });
            let switcher = new Gtk.StackSwitcher({ stack: stack });
            vbox.pack_start(switcher, false, false, 0);
            vbox.pack_start(stack, true, true, 0);

            // --- Page 1: Counter ---
            let counterPage = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 20,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER
            });

            this.count = 0;
            let countLabel = new Gtk.Label({ use_markup: true });
            // Increase font size
            countLabel.set_markup(`<span size="xx-large" weight="bold">Count: 0</span>`);

            let countBtn = new Gtk.Button({ label: "Increment" });
            countBtn.connect('clicked', () => {
                this.count++;
                countLabel.set_markup(`<span size="xx-large" weight="bold">Count: ${this.count}</span>`);
            });

            counterPage.add(countLabel);
            counterPage.add(countBtn);
            stack.add_titled(counterPage, "counter", "Counter");


            // --- Page 2: Recorder ---
            let recorderPage = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 20,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER
            });

            let fileEntry = new Gtk.Entry({
                text: "recording.mp4",
                placeholder_text: "Filename"
            });

            let recordBtn = new Gtk.Button({ label: "Start Recording" });
            let statusLabel = new Gtk.Label({ label: "Status: Idle" });

            recorderPage.add(new Gtk.Label({ label: "Output Filename:" }));
            recorderPage.add(fileEntry);
            recorderPage.add(recordBtn);
            recorderPage.add(statusLabel);
            stack.add_titled(recorderPage, "recorder", "Recorder");

            // Recorder Logic
            this.pipeline = null;
            this.isRecording = false;

            recordBtn.connect('clicked', () => {
                if (!this.isRecording) {
                    this._startRecording(fileEntry.get_text(), recordBtn, statusLabel);
                } else {
                    this._stopRecording(recordBtn, statusLabel);
                }
            });

            win.show_all();
        }

        _startRecording(filename, btn, statusInfo) {
            if (this.pipeline) {
                this.pipeline.set_state(Gst.State.NULL);
                this.pipeline = null;
            }

            // ximagesrc is for X11. 
            // Pipeline: capture -> convert -> encode -> mux -> file
            // Warning: x264enc might not be installed, we should gracefully fail or use software fallback if needed.
            // But assume standard gstreamer-plugins-ugly/libav is present or user has them.
            // Using 'safe' defaults: queue to prevent blocking.

            const pipelineStr = `ximagesrc ! videoconvert ! queue ! x264enc ! mp4mux ! filesink location="${filename}"`;

            try {
                this.pipeline = Gst.parse_launch(pipelineStr);

                let bus = this.pipeline.get_bus();
                bus.add_signal_watch();
                bus.connect('message', (bus, msg) => {
                    this._onBusMessage(msg, btn, statusInfo);
                });

                let ret = this.pipeline.set_state(Gst.State.PLAYING);
                if (ret === Gst.StateChangeReturn.FAILURE) {
                    print("Unable to set the pipeline to the playing state.");
                    statusInfo.set_text("Status: Error starting");
                    this.pipeline = null;
                    return;
                }

                this.isRecording = true;
                btn.set_label("Stop Recording");
                statusInfo.set_text("Status: Recording...");

            } catch (e) {
                print("Error creating pipeline: " + e.message);
                statusInfo.set_text("Error: " + e.message);
            }
        }

        _stopRecording(btn, statusInfo) {
            if (!this.pipeline) return;

            // Send EOS to finish the file properly
            statusInfo.set_text("Status: Stopping...");
            btn.set_sensitive(false); // disable until finished

            let event = Gst.Event.new_eos();
            this.pipeline.send_event(event);
        }

        _onBusMessage(msg, btn, statusInfo) {
            switch (msg.type) {
                case Gst.MessageType.EOS:
                    print("End of stream");
                    this.pipeline.set_state(Gst.State.NULL);
                    this.pipeline = null;
                    this.isRecording = false;
                    btn.set_label("Start Recording");
                    btn.set_sensitive(true);
                    statusInfo.set_text("Status: Saved.");
                    break;
                case Gst.MessageType.ERROR:
                    let [err, debug] = msg.parse_error();
                    print("Error: " + err.message);
                    this.pipeline.set_state(Gst.State.NULL);
                    this.pipeline = null;
                    this.isRecording = false;
                    btn.set_label("Start Recording");
                    btn.set_sensitive(true);
                    statusInfo.set_text("Error: " + err.message);
                    break;
            }
        }
    }
);

const Gio = imports.gi.Gio;
const app = new ScreenRecorderApp();
app.run(ARGV);
