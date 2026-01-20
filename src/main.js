/**
 * main.js
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ScreenshotWindow } from './window.js';
import { CaptureBackend } from './screenshot/constants.js';
import { settings, isBackendAvailable } from './screenshot/utils.js';

(() => {
    const preferred = settings.get_string("capture-backend");

    // Try preferred first
    if (isBackendAvailable(preferred)) {
        settings.set_string("capture-backend-auto", preferred);
        return;
    }

    // Fallback order: X11 -> SHELL -> GRIM
    const backends = [CaptureBackend.X11, CaptureBackend.SHELL, CaptureBackend.GRIM, CaptureBackend.PORTAL];
    for (const b of backends) {
        if (b === preferred) continue; // Already checked
        if (isBackendAvailable(b)) {
            settings.set_string("capture-backend-auto", b);
            print(`[Makas] Preferred backend '${preferred}' unavailable. Falling back to '${b}'.`);
            return;
        }
    }
    print(`[Makas] WARNING: No working capture backend found! Falling back to X11.`);
    settings.set_string("capture-backend-auto", CaptureBackend.X11); // Hope xWayland is available
})();

export const ScreenRecorderApp = GObject.registerClass(
    class ScreenRecorderApp extends Gtk.Application {

        constructor() {
            super({ application_id: 'com.github.murat.karakaya.Makas', flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
        }

        vfunc_startup() {
            super.vfunc_startup();

            const quit_action = new Gio.SimpleAction({ name: 'quit' });
            quit_action.connect('activate', action => {
                this.quit();
            });
            this.add_action(quit_action);
            this.set_accels_for_action('app.quit', ['<primary>q']);

            const show_about_action = new Gio.SimpleAction({ name: 'about' });
            show_about_action.connect('activate', action => {
                let aboutParams = {
                    transient_for: this.active_window,
                    modal: true,
                    program_name: 'Makas',
                    logo_icon_name: 'com.github.murat.karakaya.Makas',
                    version: '0.1.0',
                    authors: [
                        'Murat'
                    ],
                    copyright: '© 2026 Murat'
                };
                const aboutDialog = new Gtk.AboutDialog(aboutParams);
                aboutDialog.present();
            });
            this.add_action(show_about_action);

            const disableNotificationsAction = new Gio.SimpleAction({ name: 'disable-notifications' });
            disableNotificationsAction.connect('activate', () => {
                settings.set_boolean('show-notification', false);
            });
            this.add_action(disableNotificationsAction);

            const activateAction = new Gio.SimpleAction({ name: 'activate' });
            activateAction.connect('activate', () => {
                this.activate();
            });
            this.add_action(activateAction);
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
