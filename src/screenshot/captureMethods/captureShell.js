import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { CaptureMode } from "../constants.js";
import { getCurrentDate } from "../utils.js";

export async function captureWithShell(includePointer, captureMode, selectionResults) {
    const serviceNameGnome = "org.gnome.Shell.Screenshot";
    const interfaceNameGnome = serviceNameGnome;
    const objectPathGnome = "/org/gnome/Shell/Screenshot";

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
                true, // flash
                tmpFilename,
            ]);
            break;
        case CaptureMode.WINDOW:
            method = "ScreenshotWindow";
            dbusParams = new GLib.Variant("(bbbs)", [
                true, // include_decorations
                includePointer,
                true, // flash
                tmpFilename,
            ]);
            break;
        /* Commented out. Because freezing screen is implemented instead.
        case CaptureMode.AREA:
            if (includePointer) {
                // SCREENSHOT_AREA doesn't support cursor in Shell.
                // We capture SCREEN (0) instead, then crop.
                method = "Screenshot";
                dbusParams = new GLib.Variant("(bbs)", [
                    true, // include_pointer
                    false, // disabled because this one would've flashed the entire screen
                    tmpFilename,
                ]);
                break;
            }
            method = "ScreenshotArea";
            dbusParams = new GLib.Variant("(iiiibs)", [
                params.x,
                params.y,
                params.width,
                params.height,
                true, // flash
                tmpFilename,
            ]);
            break;

        */
        case CaptureMode.AREA:
            method = "Screenshot";
            dbusParams = new GLib.Variant("(bbs)", [
                true, // include_pointer
                false, // disabled because this one would've flashed the entire screen
                tmpFilename,
            ]);
            break;
        default:
            throw new Error("Invalid screenshot mode. Please report this issue to the developer.");
    }

    try {
        connection.call_sync(
            serviceNameGnome,
            objectPathGnome,
            interfaceNameGnome,
            method,
            dbusParams,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );

        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(tmpFilename);
        GLib.unlink(tmpFilename);

        /* Commented out. Because freezing screen is implemented instead.

        if (captureMode === CaptureMode.AREA && includePointer) {
            const cropped = pixbuf.new_subpixbuf(
                params.x,
                params.y,
                params.width,
                params.height
            );

            connection.call(
                serviceNameGnome,
                objectPathGnome,
                interfaceNameGnome,
                "FlashArea",
                new GLib.Variant("(iiii)", [
                    params.x,
                    params.y,
                    params.width,
                    params.height
                ]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null
            );
            return cropped.copy();
        } */

        return pixbuf;
    } catch (e) {
        print(`Shell screenshot (${method}) failed: ${e.message}`);
        if (GLib.file_test(tmpFilename, GLib.FileTest.EXISTS)) {
            GLib.unlink(tmpFilename);
        }
        return null;
    }
}