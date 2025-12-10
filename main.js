#!/usr/bin/env gjs

imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gst = '1.0';

const { Gtk, Gdk, Gst, GObject, Gio, GLib } = imports.gi;



// Initialize GStreamer
Gst.init(null);

// Import local modules
imports.searchPath.unshift('.');
const Recorder = imports.recorder;
const Screenshot = imports.screenshot;

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
                title: "GJS Screen Tools"
            });

            // Main container
            let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
            win.add(vbox);

            // Stack Switcher
            let stack = new Gtk.Stack({
                transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT
            });
            let switcher = new Gtk.StackSwitcher({
                stack: stack,
                halign: Gtk.Align.CENTER,
                margin_top: 10,
                margin_bottom: 10
            });

            vbox.pack_start(switcher, false, false, 0);
            vbox.pack_start(stack, true, true, 0);

            // --- Page 1: Screenshot ---
            let screenshotPage = new Screenshot.ScreenshotPage();
            stack.add_titled(screenshotPage, "screenshot", "Screenshot");


            // --- Page 2: Recorder ---
            let recorderPage = new Recorder.RecorderPage();
            stack.add_titled(recorderPage, "recorder", "Recorder");

            win.show_all();
        }
    }
);

const app = new ScreenRecorderApp();
app.run(ARGV);
