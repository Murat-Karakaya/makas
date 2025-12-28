import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot";
import Gio from "gi://Gio";

// C library instance for window capture with XShape support
let screenshotHelper = null;

/**
 * Get the C library screenshot helper instance.
 * @returns {MakasScreenshot.Screenshot}
 */
function getScreenshotHelper() {
  if (!screenshotHelper) {
    screenshotHelper = MakasScreenshot.Screenshot.new();
  }
  return screenshotHelper;
}

/**
 * Composite cursor onto pixbuf using C library (handles offsets).
 * @param {GdkPixbuf.Pixbuf} pixbuf
 * @param {number} offsetX - Root X offset
 * @param {number} offsetY - Root Y offset
 */
export function compositeCursor(pixbuf, offsetX = 0, offsetY = 0) {
  const helper = getScreenshotHelper();
  helper.composite_cursor(pixbuf, offsetX, offsetY);
}

/**
 * Capture a window at (x, y) with decorations and transparent rounded corners.
 * Uses the C library with XShape support.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {boolean} includePointer
 * @returns {GdkPixbuf.Pixbuf|null}
 */
export function captureWindowWithXShape(x, y, includePointer = false) {
  const helper = getScreenshotHelper();
  return helper.capture_window(x, y, includePointer);
}

/**
 * Capture using Shell D-Bus interface.
 * @param {boolean} includePointer
 * @param {object} params - { mode, x, y, width, height }
 * @returns {Promise<GdkPixbuf.Pixbuf|null>}
 */
export async function captureWithShell(includePointer, captureMode, params) {
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
  // SCREEN: 0, WINDOW: 1, AREA: 2
  switch (captureMode) {
    case 0:
      method = "Screenshot";
      dbusParams = new GLib.Variant("(bbs)", [
        includePointer,
        true, // flash
        tmpFilename,
      ]);
      break;
    case 1:
      method = "ScreenshotWindow";
      dbusParams = new GLib.Variant("(bbbs)", [
        true, // include_decorations
        includePointer,
        true, // flash
        tmpFilename,
      ]);
      break;
    case 2:
      if (includePointer) {
        // SCREENSHOT_AREA doesn't support cursor in Shell.
        // We capture SCREEN (0) instead, then crop.
        method = "Screenshot";
        dbusParams = new GLib.Variant("(bbs)", [
          true, // include_pointer
          false, // flash - False to avoid flashing the entire screen
          tmpFilename,
        ]);
      } else {
        method = "ScreenshotArea";
        dbusParams = new GLib.Variant("(iiiibs)", [
          params.x,
          params.y,
          params.width,
          params.height,
          true, // flash
          tmpFilename,
        ]);
      }
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

    // If we hijacked area capture for cursor, we need to crop now
    if (captureMode === 2 && includePointer && pixbuf) {
      const cropped = pixbuf.new_subpixbuf(
        params.x,
        params.y,
        params.width,
        params.height
      );
      // COPY to ensure we have a clean pixbuf, not sharing buffer
      return cropped.copy();
    }

    return pixbuf;
  } catch (e) {
    print(`Shell screenshot (${method}) failed: ${e.message}`);
    if (GLib.file_test(tmpFilename, GLib.FileTest.EXISTS)) {
      GLib.unlink(tmpFilename);
    }
    return null;
  }
}

/**
 * Check if the Shell screenshot interface is available.
 * @returns {boolean}
 */
export function hasShellScreenshot() {
  const serviceNameGnome = "org.gnome.Shell.Screenshot";

  const connection = Gio.DBus.session;
  try {
    // We try to call a method that we know exists but with invalid arguments
    // to see if the interface itself is responsive, or we can just check names.
    // However, checking for the name on the bus is more reliable for "availability".
    const result = connection.call_sync(
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "GetNameOwner",
      new GLib.Variant("(s)", [serviceNameGnome]),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
    );
    return !!result;
  } catch (e) {
    return false;
  }
}


export const getCurrentDate = () => {
  const date = new Date();
  const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}-${String(date.getSeconds()).padStart(2, "0")}`;
  return formattedDate;
};

export const getDestinationPath = (options) => {
  let folder = options.folder;
  const name = options.filename;
  if (!folder || !name) return null;
  if (!folder.endsWith("/")) folder += "/";
  return folder + name;
};


/**
 * Wait for a specified number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function wait(ms) {
  return new Promise((resolve) => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve();
      return GLib.SOURCE_REMOVE;
    });
  });
}


export const settings = new Gio.Settings({
  schema_id: "org.x.Makas",
});
