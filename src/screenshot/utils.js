import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot";
import Gio from "gi://Gio";

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
