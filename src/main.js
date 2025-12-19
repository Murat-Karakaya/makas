/**
 * main.js
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

// Force X11 backend as the app currently only works on X11
GLib.setenv('GDK_BACKEND', 'x11', true);

import { ScreenshotWindow } from './window.js';

export const ScreenRecorderApp = GObject.registerClass(
    class ScreenRecorderApp extends Gtk.Application {
        _init() {
            super._init({
                application_id: 'org.x.Makas',
                flags: Gio.ApplicationFlags.FLAGS_NONE
            });
        }

        vfunc_activate() {
            let win = this.active_window;
            if (!win) {
                win = new ScreenshotWindow(this);
            }
            win.present();
        }
    }
);

export function main(argv) {
    const app = new ScreenRecorderApp();
    return app.run(argv);
}
