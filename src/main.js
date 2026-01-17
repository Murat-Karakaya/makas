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
        _init() {
            super._init({
                application_id: 'org.x.Makas',
                flags: Gio.ApplicationFlags.FLAGS_NONE
            });
        }

        vfunc_startup() {
            super.vfunc_startup();

            // Add resource path for icons to let GTK find our bundled icons
            Gtk.IconTheme.get_default().add_resource_path("/com/github/Murat-Karakaya/Makas/icons");

            // Register action for disabling notifications from notification button
            const disableNotificationsAction = new Gio.SimpleAction({ name: 'disable-notifications' });
            disableNotificationsAction.connect('activate', () => {
                settings.set_boolean('show-notification', false);
            });
            this.add_action(disableNotificationsAction);
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
