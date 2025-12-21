/**
 * main.js
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ScreenshotWindow } from './window.js';
import { settings, hasShellScreenshot } from './screenshot/utils.js';

if (!hasShellScreenshot()) {
    settings.set_int('capture-backend', 1);
}

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
    return app.runAsync(argv);
}
