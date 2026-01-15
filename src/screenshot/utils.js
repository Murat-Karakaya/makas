import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot";
import Gio from "gi://Gio";
import { CaptureBackend } from "./constants.js";

let screenshotHelper = null;
/**
 * Get the C library screenshot helper instance.
 * @returns {MakasScreenshot.Screenshot}
 */
export function getScreenshotHelper() {
  if (!screenshotHelper) {
    screenshotHelper = MakasScreenshot.Screenshot.new();
  }
  return screenshotHelper;
}

/**
 * Check if the Shell screenshot interface is available.
 * @returns {boolean}
 */
export function hasShellScreenshot() {
  const serviceName = "org.gnome.Shell.Screenshot";
  const objectPath = "/org/gnome/Shell/Screenshot";

  try {
    const connection = Gio.DBus.session;
    const result = connection.call_sync(
      serviceName,
      objectPath,
      "org.freedesktop.DBus.Introspectable",
      "Introspect",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null
    );

    const xml = result.deep_unpack()[0];
    return xml.includes('method name="Screenshot"');
  } catch (e) {
    return false;
  }
}

/**
 * Check if Grim (Wayland wlroots) screenshot is available.
 * @returns {boolean}
 */
export function hasGrimScreenshot() {
  const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
  if (!waylandDisplay) return false;

  const grimPath = GLib.find_program_in_path("grim");
  if (!grimPath) return false;

  try {
    return MakasScreenshot.utils_has_wlroots();
  } catch (e) {
    return false;
  }
}

/**
 * Check if X11 screenshot is available.
 * @returns {boolean}
 */
export function hasX11Screenshot() {
  return GLib.getenv("XDG_SESSION_TYPE") === "x11";
}

/**
 * Check if FreeDesktop Portal screenshot is available.
 * @returns {boolean}
 */
export function hasPortalScreenshot() {
  const serviceName = "org.freedesktop.portal.Desktop";
  const objectPath = "/org/freedesktop/portal/desktop";

  try {
    const connection = Gio.DBus.session;
    const result = connection.call_sync(
      serviceName,
      objectPath,
      "org.freedesktop.DBus.Introspectable",
      "Introspect",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null
    );

    const xml = result.deep_unpack()[0];
    return xml.includes('interface name="org.freedesktop.portal.Screenshot"');
  } catch (e) {
    return false;
  }
}

/**
 * Check if a specific backend is available on the current system.
 * @param {string} backend 
 * @returns {boolean}
 */
export function isBackendAvailable(backend) {
  switch (backend) {
    case CaptureBackend.SHELL:
      return hasShellScreenshot();
    case CaptureBackend.X11:
      return hasX11Screenshot();
    case CaptureBackend.GRIM:
      return hasGrimScreenshot();
    case CaptureBackend.PORTAL:
      return hasPortalScreenshot();
    default:
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
