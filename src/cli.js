import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import { settings, showScreenshotNotification, wait } from './screenshot/utils.js';
import { CaptureMode } from './screenshot/constants.js';
import { performCapture } from './screenshot/captureMethods/performCapture.js';
import { selectArea } from './screenshot/areaSelectionMethods/selectArea.js';
import { flashRect } from './screenshot/popupWindows/flash.js';

export async function executeCLIAction(app, window, options) {
    // 1. Handle Settings Changes
    if (options.settingsToSet.length > 0) {
        for (const s of options.settingsToSet) {
            const schemaKey = settings.settings_schema.get_key(s.key);
            if (!schemaKey) {
                print(`[Makas] Error: Unknown setting '${s.key}'`);
                continue;
            }
            
            const type = schemaKey.get_value_type().dup_string();
            try {
                if (type === 'b') {
                    settings.set_boolean(s.key, s.value === 'true' || s.value === '1');
                } else if (type === 'i') {
                    settings.set_int(s.key, parseInt(s.value));
                } else if (type === 's') {
                    settings.set_string(s.key, s.value);
                } else {
                     print(`[Makas] Unsupported setting type for cli: ${type}`);
                }
                print(`[Makas] Set '${s.key}' to '${s.value}'`);
            } catch (e) {
                print(`[Makas] Error setting '${s.key}': ${e.message}`);
            }
        }
        app.quit();
        return; 
    }

    const captureBackendValue = options.backend || settings.get_string("capture-backend-auto");
    const captureMode = options.mode || settings.get_string("screenshot-mode") || CaptureMode.SCREEN;
    const includePointer = options.pointerSet ? options.includePointer : settings.get_boolean("include-pointer");
    const delay = options.delay !== null ? options.delay : 0; 
    
    // Explicit backend disables fallback
    const disableFallback = !!options.backend;

    try {
        const topLevel = window;
        const windowWait = settings.get_int("window-wait");

        // Handle Delay
        if (delay > 0) {
             print(`[Makas] Waiting ${delay} seconds...`);
             await wait(delay * 1000);
        }

        if (settings.get_boolean("hide-window")) {
             topLevel.hide();
             await wait(windowWait);
        }
        
        let pixbuf;
        
        if (captureMode === CaptureMode.AREA) {
             const screenResult = await performCapture(captureBackendValue, { 
                 captureMode: CaptureMode.SCREEN, 
                 includePointer: false, 
                 topLevel,
                 disableFallback
             });
             
             if (!screenResult || !screenResult.pixbuf) throw new Error("Pre-capture for area selection failed.");
             
             const selection = await selectArea(screenResult.pixbuf);
             if (!selection) {
                 print("[Makas] Area selection cancelled.");
                 if (!options.interactive) app.quit();
                 return; 
             }
             
             pixbuf = screenResult.pixbuf.new_subpixbuf(
                 Math.max(0, selection.x),
                 Math.max(0, selection.y),
                 Math.min(screenResult.pixbuf.get_width(), selection.width),
                 Math.min(screenResult.pixbuf.get_height(), selection.height)
             );
             
             flashRect(selection.x, selection.y, selection.width, selection.height, topLevel);
             
        } else {
             const result = await performCapture(captureBackendValue, { 
                 captureMode, 
                 includePointer, 
                 topLevel,
                 disableFallback
             });
             pixbuf = result.pixbuf;
             flashRect(result.x, result.y, pixbuf.get_width(), pixbuf.get_height(), topLevel);
        }
        
        if (!pixbuf) {
            throw new Error("No pixbuf generated.");
        }

        // Post-Capture Actions
        if (options.file) {
            try {
                let filepath = options.file;
                pixbuf.savev(filepath, "png", [], []);
                print(`[Makas] Saved to ${filepath}`);
                
                if (settings.get_boolean("show-notification")) {
                     const notif = new Gio.Notification();
                     notif.set_title("Screenshot Saved");
                     notif.set_body(`Saved to ${filepath}`);
                     app.send_notification("screenshot-saved", notif);
                }
                
                // Small delay to ensure notification is sent
                await wait(200);
                app.quit();

            } catch (e) {
                print(`[Makas] Failed to save to file: ${e.message}`);
                window.show(); 
                window.present();
                if (window.screenshotPage) window.screenshotPage.setUpPostScreenshot(pixbuf);
                return;
            }
        } else if (options.clipboard) {
            const CLIPBOARD_ATOM = Gdk.Atom.intern("CLIPBOARD", false);
            const clipboard = Gtk.Clipboard.get(CLIPBOARD_ATOM);
            clipboard.set_image(pixbuf);
            clipboard.store(); 
            print(`[Makas] Copied to clipboard.`);
            showScreenshotNotification(app);
            
            // Wait for clipboard transfer negotiation if needed
            // 500ms usually enough for store() to register
            await wait(500); 
            app.quit();
        } else {
            // Default: Show Post-Screenshot UI
            window.show();
            window.present();
            if (window.screenshotPage) {
                 window.screenshotPage.setUpPostScreenshot(pixbuf);
            }
            showScreenshotNotification(app);
            // Do NOT quit here, let the user interact with the window
        }

    } catch (e) {
        print(`[Makas] Capture failed: ${e.message}`);
        if (!options.interactive && (options.file || options.clipboard)) {
             // If we were supposed to be headless but failed, quit?
             // Or show GUI to show error? 
             // Maybe show GUI.
        }
        window.show();
        window.present();
    }
}
