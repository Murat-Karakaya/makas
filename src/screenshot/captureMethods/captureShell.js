import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { CaptureMode } from "../constants.js";
import { getCurrentDate } from "../utils.js";
import { wait } from "../utils.js";
import { settings } from "../utils.js";

const flashEnabled = settings.get_boolean("enable-flash");

export async function captureWithShell(includePointer, captureMode) {
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
                flashEnabled,
                tmpFilename,
            ]);
            break;
        case CaptureMode.WINDOW:
            method = "ScreenshotWindow";
            dbusParams = new GLib.Variant("(bbbs)", [
                true, // include_decorations
                includePointer,
                flashEnabled, // flash
                tmpFilename,
            ]);
            break;
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
}