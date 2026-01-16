import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { CaptureMode } from "../constants.js";
import { getCurrentDate } from "../utils.js";
import { wait } from "../utils.js";

export async function captureWithShell(includePointer, captureMode, selectionResults) {
    const serviceName = "org.Cinnamon";
    const interfaceName = "org.Cinnamon";
    const objectPath = "/org/Cinnamon";

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
                includePointer,
                false, // disabled because this one would've flashed the entire screen
                tmpFilename,
            ]);
            break;
        default:
            throw new Error("Invalid screenshot mode. Please report this issue to the developer.");
    }

    await connection.call(
        serviceName,
        objectPath,
        interfaceName,
        method,
        dbusParams,
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        null
    );

    let pixbuf;

    for (let i = 0; i < 30; i++) { // This kind of shitshow is sadly mandatory.
        try {
            pixbuf = GdkPixbuf.Pixbuf.new_from_file(tmpFilename);
            break
        } catch (error) {
            await wait(100);
        }
    }

    GLib.unlink(tmpFilename);

    if (!pixbuf) {
        throw new Error("Shell screenshot failed");
    }
    return pixbuf;

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
}