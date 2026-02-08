import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import { settings, backends, showScreenshotNotification, wait, getCurrentDate } from './screenshot/utils.js';
import { CaptureMode, CaptureBackend } from './screenshot/constants.js';
import { performCapture } from './screenshot/captureMethods/performCapture.js';
import { selectArea } from './screenshot/areaSelectionMethods/selectArea.js';
import { flashRect } from './screenshot/popupWindows/flash.js';

const APP_VERSION = '0.1.0'; // Sync with main.js/meson.build

export function parseCLI(argv) {
    const args = argv.slice(1);
    const options = {
        action: null,
        mode: null,
        includePointer: false,
        pointerSet: false,
        backend: null,
        delay: null,
        clipboard: false,
        file: null,
        interactive: false,
        exit: false,
        settingsToSet: [],
        gjsArgv: [argv[0]]
    };

    const resolveBackend = (name) => {
        const lower = name.toLowerCase();
        for (const key in backends) {
            if (key.toLowerCase() === lower || backends[key].label.toLowerCase().includes(lower)) {
                return key;
            }
        }
        return name;
    };

    const isFlag = (arg) => arg.startsWith('-');

    // Check if we have any args that determine action, otherwise default to capture
    // But we need to parse first.

    for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        let val = null;
        
        if (arg === '--') continue;

        // Handle --param=value syntax
        if (arg.startsWith('--') && arg.includes('=')) {
            const parts = arg.split('=');
            arg = parts[0];
            val = parts.slice(1).join('=');
        }

        if (arg === '--help' || arg === '-h') {
             printHelp();
             options.exit = true;
             return options;
        } else if (arg === '--version') {
             print(`Makas ${APP_VERSION}`);
             options.exit = true;
             return options;
        } else if (arg === '--clipboard' || arg === '-c') {
            options.action = 'capture';
            options.clipboard = true;
        } else if (arg === '--window' || arg === '-w') {
            options.action = 'capture';
            options.mode = CaptureMode.WINDOW;
        } else if (arg === '--area' || arg === '-a') {
            options.action = 'capture';
            options.mode = CaptureMode.AREA;
        } else if (arg === '--include-pointer' || arg === '-p') {
            options.includePointer = true;
            options.pointerSet = true;
        } else if (arg === '--delay' || arg === '-d') {
            options.action = 'capture'; 
            if (val) {
                options.delay = parseInt(val, 10);
            } else if (i + 1 < args.length && !isFlag(args[i+1])) {
                options.delay = parseInt(args[++i], 10);
            } else {
                 print(`[Makas] Error: Argument '${arg}' requires a value (seconds).`);
                 options.exit = true;
            }
        } else if (arg === '--interactive' || arg === '-i') {
            options.interactive = true;
        } else if (arg === '--file' || arg === '-f') {
            options.action = 'capture';
            if (val) {
                options.file = val;
            } else if (i + 1 < args.length && !isFlag(args[i+1])) {
                options.file = args[++i];
            } else {
                 print(`[Makas] Error: Argument '${arg}' requires a filename.`);
                 options.exit = true;
            }
        } else if (arg === '--backend' || arg === '-b') {
             // Only setting backend doesn't imply capture action necessarily, 
             // but if no other action, we usually assume capture unless -i is passed.
             // We'll resolve this after loop.
             if (val) {
                options.backend = resolveBackend(val);
             } else if (i + 1 < args.length && !isFlag(args[i+1])) {
                options.backend = resolveBackend(args[++i]);
             } else {
                print(`[Makas] Error: Argument '${arg}' requires a backend name.`);
                options.exit = true;
             }
        } else if (arg === '--set' || arg === '-s') {
            let settingStr = val;
            if (!settingStr && i + 1 < args.length && !isFlag(args[i+1])) {
                 settingStr = args[++i];
            }
            
            if (settingStr) {
                const sParts = settingStr.split('=');
                if (sParts.length === 2) {
                    options.settingsToSet.push({key: sParts[0], value: sParts[1]});
                } else {
                    print(`[Makas] Error: Invalid format for --set. Use 'key=value'. Given: ${settingStr}`);
                    options.exit = true;
                }
                options.exit = true; 
            } else {
                print(`[Makas] Error: Argument '${arg}' requires a 'key=value' pair.`);
                options.exit = true;
            }
        } else {
            options.gjsArgv.push(arg);
        }
    }
    
    if (options.exit) return options;

    if (options.interactive) {
        options.action = null; // Forces main.js to use win.present() (PreScreenshot)
    } else {
        // If not interactive, and no specific action set, default to capture
        // But if we just set settings (--set), we exit already.
        // If we just set --backend but no --capture, do we capture?
        // User said: "not passing arguments should simply capture"
        // So default is capture.
        if (!options.action) {
             options.action = 'capture';
        }
    }

    return options;
}

function printHelp() {
    print(`Usage:
  makas [OPTION...]

Help Options:
  -h, --help                     Show help options

Application Options:
  -c, --clipboard                Send the grab directly to the clipboard
  -w, --window                   Grab a window instead of the entire screen
  -a, --area                     Grab an area of the screen instead of the entire screen
  -p, --include-pointer          Include the pointer with the screenshot
  -d, --delay=seconds            Take screenshot after specified delay [in seconds]
  -i, --interactive              Interactively set options
  -f, --file=filename            Save screenshot directly to this file
  --version                      Print version information and exit
  -b, --backend=backend          Select backend temporarily (x11, shell, grim, portal)
  -s, --set=key=value            Set a configuration option
`);
}

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
