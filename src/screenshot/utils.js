import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";
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

const methodAvailablity = {
  shell: null,
  x11: null,
  grim: null,
  portal: null,
};

/**
 * Check if the Shell screenshot interface is available.
 * @returns {boolean}
 */
export function hasShellScreenshot() {
  if (methodAvailablity.shell !== null) return methodAvailablity.shell;
  const currentDesktop = GLib.getenv("XDG_CURRENT_DESKTOP");
  return methodAvailablity.shell = currentDesktop !== null && currentDesktop.includes("Cinnamon");
}

/**
 * Check if Grim (Wayland wlroots) screenshot is available.
 * @returns {boolean}
 */
export function hasGrimScreenshot() {
  if (methodAvailablity.grim !== null) return methodAvailablity.grim;

  const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
  if (!waylandDisplay) return methodAvailablity.grim = false;

  const grimPath = GLib.find_program_in_path("grim");
  if (!grimPath) return methodAvailablity.grim = false;

  try {
    return methodAvailablity.grim = MakasScreenshot.utils_is_grim_supported();
  } catch (e) {
    console.error("Failed to check Grim availability:", e);
    return methodAvailablity.grim = false;
  }
}

/**
 * Check if X11 screenshot is available.
 * @returns {boolean}
 */
export function hasX11Screenshot() {
  if (methodAvailablity.x11 !== null) return methodAvailablity.x11;
  return methodAvailablity.x11 = GLib.getenv("XDG_SESSION_TYPE") === "x11";
}

/**
 * Check if FreeDesktop Portal screenshot is available.
 * @returns {boolean}
 */
export function hasPortalScreenshot() {
  if (methodAvailablity.portal !== null) return methodAvailablity.portal;

  const serviceName = "org.freedesktop.portal.Desktop";
  const objectPath = "/org/freedesktop/portal/desktop";
  const interfaceName = "org.freedesktop.portal.Screenshot";

  try {
    const connection = Gio.DBus.session;
    // We attempt to get the 'version' property of the Screenshot interface specifically
    connection.call_sync(
      serviceName,
      objectPath,
      "org.freedesktop.DBus.Properties",
      "Get",
      new GLib.Variant('(ss)', [interfaceName, "version"]),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null
    );

    // If this call succeeds, the interface exists and is functional
    return methodAvailablity.portal = true;
  } catch (e) {
    return methodAvailablity.portal = false;
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
  schema_id: "com.github.murat.karakaya.Makas",
});

export function showScreenshotNotification(app) {
  if (!settings.get_boolean("show-notification")) {
    return;
  }

  const notification = new Gio.Notification();
  notification.set_title("Screenshot Captured");
  notification.set_body("Your screenshot has been captured successfully.");
  notification.set_priority(Gio.NotificationPriority.NORMAL);

  // Default action: activate the app (focus window)
  notification.set_default_action("app.activate");

  // Add action to disable notifications
  notification.add_button("Disable Screenshot Notifications", "app.disable-notifications");

  app.send_notification("screenshot-captured", notification);
}
