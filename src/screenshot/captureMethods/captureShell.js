import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { CaptureMode } from "../constants.js";
import { getCurrentDate, settings, wait } from "../utils.js";

let isAvailable = null;

export async function captureWithShell({ includePointer, captureMode, topLevel }) {
    const serviceName = "org.gnome.Shell.Screenshot";
    const interfaceName = serviceName;
    const objectPath = "/org/gnome/Shell/Screenshot";

    const cacheDir = GLib.get_user_cache_dir();
    const makasCache = GLib.build_filenamev([cacheDir, "makas"]);
    GLib.mkdir_with_parents(makasCache, 0o700);

    const tmpFilename = GLib.build_filenamev([
        makasCache,
        `scr-${getCurrentDate()}.png`,
    ]);

    const connection = Gio.DBus.session;
    let method = "Screenshot";
    let dbusParams = null;
    switch (captureMode) {
        case CaptureMode.SCREEN:
            method = "Screenshot";
            dbusParams = new GLib.Variant("(bbs)", [
                includePointer,
                false,
                tmpFilename,
            ]);
            break;
        case CaptureMode.WINDOW:
            if (topLevel.get_visible()) {
                topLevel.hide(); // Top level will always be shown after capture is finished @prescreenshot.js
                await wait(settings.get_int("window-wait") * 10); // Wait for window to hide
            }
            method = "ScreenshotWindow";
            dbusParams = new GLib.Variant("(bbbs)", [
                true, // include_decorations
                includePointer,
                false,
                tmpFilename,
            ]);
            break;
        default:
            throw new Error("Invalid screenshot mode. Please report this issue to the developer.");
    }

    connection.call_sync(
        serviceName,
        objectPath,
        interfaceName,
        method,
        dbusParams,
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null
    );

    const pixbuf = GdkPixbuf.Pixbuf.new_from_file(tmpFilename);
    GLib.unlink(tmpFilename);

    if (!pixbuf) throw new Error("Pixbuf is null");
    return {
        x: 0,
        y: 0,
        pixbuf,
    };
}

export function hasShellScreenshot() {
  if (isAvailable !== null) return isAvailable;
  const currentDesktop = GLib.getenv("XDG_CURRENT_DESKTOP");
  return isAvailable = currentDesktop !== null && currentDesktop.toLowerCase().includes("cinnamon");
}