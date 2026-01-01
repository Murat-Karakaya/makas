import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot";
import Gio from "gi://Gio";
import Gdk from "gi://Gdk?version=3.0";
import { CaptureMode } from "./constants.js";

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
 * Composite cursor onto pixbuf using JS logic (Gdk/GdkPixbuf).
 * @param {GdkPixbuf.Pixbuf} pixbuf
 * @param {number} rootX - root X coordinate where the pixbuf starts
 * @param {number} rootY - root Y coordinate where the pixbuf starts
 */
export function compositeCursor(pixbuf, rootX, rootY) {
  const display = Gdk.Display.get_default();
  const seat = display.get_default_seat();
  const pointer = seat.get_pointer();

  const [_, x, y] = pointer.get_position();

  // Create cursor to get its image
  // Note: This creates a standard arrow cursor. Getting the *actual* current cursor image 
  // is quite complex
  const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.LEFT_PTR);
  const cursorPixbuf = cursor.get_image();

  if (!cursorPixbuf) return;
  let hotX = 0;
  let hotY = 0;
  try {
    const hotXStr = cursorPixbuf.get_option("x_hot");
    const hotYStr = cursorPixbuf.get_option("y_hot");
    if (hotXStr) hotX = +hotXStr; // hotX/YStr is actually a string. But the type is coerted into an int.
    if (hotYStr) hotY = +hotYStr; // Seems fishy but you gotta live life on the edge from time to time.

  } catch (e) {
    print(e);
  }

  const destX = x - rootX - hotX;
  const destY = y - rootY - hotY;

  const pbWidth = pixbuf.get_width();
  const pbHeight = pixbuf.get_height();
  const curWidth = cursorPixbuf.get_width();
  const curHeight = cursorPixbuf.get_height();

  const interX = Math.max(0, destX);
  const interY = Math.max(0, destY);
  const interRight = Math.min(pbWidth, destX + curWidth);
  const interBottom = Math.min(pbHeight, destY + curHeight);
  const interW = interRight - interX;
  const interH = interBottom - interY;

  if (interW > 0 && interH > 0) {
    cursorPixbuf.composite(
      pixbuf,
      interX,
      interY,
      interW,
      interH,
      destX,
      destY,
      1.0,
      1.0,
      GdkPixbuf.InterpType.BILINEAR,
      255
    );
  }
}

/**
 * Capture a window at (x, y) with decorations and transparent rounded corners.
 * Uses the C library with XShape support.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {object} { pixbuf, offsetX, offsetY } or null
 */
export function captureWindowWithXShape(x, y) {
  const helper = getScreenshotHelper();
  // GJS handles (out) arguments by returning an array: [return_val, out_arg1, out_arg2, ...]
  const result = helper.capture_window(x, y);

  if (!result || !result[0]) return null;

  return {
    pixbuf: result[0],
    offsetX: result[1],
    offsetY: result[2]
  };
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
