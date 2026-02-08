/**
 * main.js
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ScreenshotWindow } from './window.js';
import { CaptureBackend } from './screenshot/constants.js';
import { settings, backends } from './screenshot/utils.js';
import { parseCLI, executeCLIAction } from './cli.js';

(() => {
    const preferred = settings.get_string("capture-backend");

    // Try preferred first
    if (backends[preferred] && backends[preferred].isAvailable()) {
        settings.set_string("capture-backend-auto", preferred);
        return;
    }

    // Fallback order: Determined by keys in backends object
    for (const b in backends) {
        if (b === preferred) continue; // Already checked
        if (backends[b].isAvailable()) {
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

            if (this.cliOptions && this.cliOptions.action === 'capture') {
                executeCLIAction(this, win, this.cliOptions);
            } else {
                win.present();
            }
        }
    }
);

export function main(argv) {
    const cliResult = parseCLI(argv);
    if (cliResult.exit) {
        return 0;
    }

    const app = new ScreenRecorderApp();
    app.cliOptions = cliResult;
    return app.runAsync(cliResult.gjsArgv);
}
