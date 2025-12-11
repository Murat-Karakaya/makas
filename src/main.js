/**
 * main.js
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gst from 'gi://Gst';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ScreenrecorderWindow } from './window.js';

// Initialize GStreamer
Gst.init(null);

export const ScreenRecorderApp = GObject.registerClass(
    class ScreenRecorderApp extends Gtk.Application {
        _init() {
            super._init({
                application_id: 'org.example.ScreenRecorder',
                flags: Gio.ApplicationFlags.FLAGS_NONE
            });
        }

        vfunc_activate() {
            let win = this.active_window;
            if (!win) {
                win = new ScreenrecorderWindow(this);
            }
            win.present();
        }
    }
);

export function main(argv) {
    const app = new ScreenRecorderApp();
    return app.run(argv);
}
