import Gdk from "gi://Gdk?version=3.0";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GdkX11 from "gi://GdkX11?version=3.0";
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
 * Capture a window at (x, y) with decorations and transparent rounded corners.
 * Uses the C library with XShape support.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {boolean} includePointer - Whether to include mouse pointer
 * @returns {GdkPixbuf.Pixbuf|null}
 */
export function captureWindowWithXShape(x, y, includePointer) {
  const helper = getScreenshotHelper();
  return helper.capture_window(x, y, includePointer);
}

/**
 * Capture using Shell D-Bus interface.
 * @param {boolean} includePointer
 * @param {object} params - { mode, x, y, width, height }
 * @returns {Promise<GdkPixbuf.Pixbuf|null>}
 */
export async function captureWithShell(includePointer, params) {
  const serviceNameGnome = "org.gnome.Shell.Screenshot";
  const objectPathGnome = "/org/gnome/Shell/Screenshot";
  const interfaceNameGnome = "org.gnome.Shell.Screenshot";

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

  // We use numeric modes consistent with CaptureMode in screenshot.js
  // SCREEN: 0, WINDOW: 1, AREA: 2
  if (params.mode === 1) {
    method = "ScreenshotWindow";
    dbusParams = new GLib.Variant("(bbbs)", [
      true, // include_decorations
      includePointer,
      true, // flash
      tmpFilename,
    ]);
  } else if (params.mode === 2) {
    method = "ScreenshotArea";
    dbusParams = new GLib.Variant("(iiiibs)", [
      params.x,
      params.y,
      params.width,
      params.height,
      true, // flash
      tmpFilename,
    ]);
  } else {
    method = "Screenshot";
    dbusParams = new GLib.Variant("(bbs)", [
      includePointer,
      true, // flash
      tmpFilename,
    ]);
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
    return pixbuf;
  } catch (e) {
    print(`Shell screenshot (${method}) failed: ${e.message}`);
    if (GLib.file_test(tmpFilename, GLib.FileTest.EXISTS)) {
      GLib.unlink(tmpFilename);
    }
    return null;
  }
}

export function compositePointer(pixbuf) {
  try {
    const display = Gdk.Display.get_default();
    const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.LEFT_PTR);
    const cursorPixbuf = cursor.get_image();

    if (!cursorPixbuf) {
      return pixbuf;
    }

    // Get cursor position
    const seat = display.get_default_seat();
    const pointer = seat.get_pointer();
    const [, x, y] = pointer.get_position();

    // Get cursor hotspot
    const xHotStr = cursorPixbuf.get_option("x_hot");
    const yHotStr = cursorPixbuf.get_option("y_hot");
    const xHot = xHotStr ? parseInt(xHotStr) : 0;
    const yHot = yHotStr ? parseInt(yHotStr) : 0;

    const cursorX = x - xHot;
    const cursorY = y - yHot;

    // Only composite if cursor is within screenshot bounds
    if (
      cursorX >= 0 &&
      cursorY >= 0 &&
      cursorX < pixbuf.get_width() &&
      cursorY < pixbuf.get_height()
    ) {
      const cursorWidth = Math.min(
        cursorPixbuf.get_width(),
        pixbuf.get_width() - cursorX,
      );
      const cursorHeight = Math.min(
        cursorPixbuf.get_height(),
        pixbuf.get_height() - cursorY,
      );

      cursorPixbuf.composite(
        pixbuf,
        cursorX,
        cursorY,
        cursorWidth,
        cursorHeight,
        cursorX,
        cursorY,
        1.0,
        1.0,
        GdkPixbuf.InterpType.BILINEAR,
        255,
      );
    }
  } catch (e) {
    print(`Failed to composite pointer: ${e.message}`);
  }

  return pixbuf;
}


/*
 * Finds the window at (x,y) and returns it as a Gdk.Window.
 * Developer's Note: This function is AI generated with Gemini 3 Pro.
 */
function getTargetGdkWindow({ x, y }) {
  let screen = Gdk.Screen.get_default();

  // 1. Get the current workspace (Desktop)
  // GdkX11.Screen methods are often mixed into the screen instance at runtime
  // or available via casting. We try the instance method first.
  let currentDesktop = null;
  if (typeof screen.get_current_desktop === 'function') {
    currentDesktop = screen.get_current_desktop();
  } else {
    // Fallback: This handles cases where GJS doesn't map the method to the object directly
    // This is rare but possible depending on the GJS/GTK version.
    // If this fails, we might assume workspace 0 or fail safe.
    try {
      currentDesktop = GdkX11.Screen.get_current_desktop(screen);
    } catch (e) {
      // If we really can't get the desktop, we can't filter safely.
      // Assuming 0 or continuing might be dangerous, but usually this works.
    }
  }

  // 2. Get the stacking list (Bottom -> Top)
  let windows = screen.get_window_stack();
  if (!windows) return null;

  // 3. Process Top -> Bottom
  windows.reverse();

  for (let i = 0; i < windows.length; i++) {
    let win = windows[i];

    // --- Filter 1: Basic X11 Visibility ---
    if (!win.is_viewable()) continue;

    // --- Filter 2: Workspace Logic ---
    // This effectively replaces Wnck.Window.is_on_workspace()
    if (currentDesktop !== null && typeof win.get_desktop === 'function') {
      let winDesktop = win.get_desktop();

      // 0xFFFFFFFF (4294967295) is the X11 standard for "Pinned" (Always on Visible Workspace)
      let isPinned = (winDesktop === 0xFFFFFFFF || winDesktop === 4294967295);

      if (winDesktop !== currentDesktop && !isPinned) {
        continue;
      }
    }

    // --- Filter 3: Window Type ---
    let typeHint = win.get_type_hint();
    if (
      typeHint === Gdk.WindowTypeHint.DESKTOP ||
      typeHint === Gdk.WindowTypeHint.DOCK
    ) {
      continue;
    }

    // --- Filter 4: Geometry Intersection ---
    // get_frame_extents includes the window decorations (title bar, etc.)
    let rect = win.get_frame_extents();

    if (
      x >= rect.x &&
      x < rect.x + rect.width &&
      y >= rect.y &&
      y < rect.y + rect.height
    ) {
      // Ensure we have the structure events (copied from your original requirement)
      win.set_events(Gdk.EventMask.STRUCTURE_MASK);
      return win;
    }
  }

  return null;
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


export function captureWindowCoordinates(startDelay, pointerCoords) {
  let activeWindow = null;

  activeWindow = getTargetGdkWindow(pointerCoords);

  if (!activeWindow) {
    print("Screenshot: Could not find a window to capture, cancelling.");
    return startDelay(null);
  }

  const toplevel = activeWindow.get_toplevel();
  const rect = toplevel.get_frame_extents();
  const width = rect.width;
  const height = rect.height;

  print(`Screenshot: Capturing window rect: w=${width}, h=${height}`);

  if (width <= 0 || height <= 0) {
    print("Screenshot: Invalid window dimensions, cancelling capture");
    return startDelay(null);
  }

  return startDelay({
    window: toplevel,
    width,
    height,
  });
}


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
