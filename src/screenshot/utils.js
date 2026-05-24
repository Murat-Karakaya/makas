import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { CaptureBackend } from "./constants.js";
import { captureWithShell, hasShellScreenshot } from "./captureMethods/captureShell.js";
import { captureWithX11, hasX11Screenshot } from "./captureMethods/captureX11.js";
import { captureWithGrim, hasGrimScreenshot } from "./captureMethods/captureGrim.js";
import { captureWithPortal, hasPortalScreenshot } from "./captureMethods/capturePortal.js";


export const settings = new Gio.Settings({
  schema_id: "com.github.murat.karakaya.Makas",
});


export const backends = {
  [CaptureBackend.X11]: {
    isAvailable: hasX11Screenshot,
    capture: captureWithX11,
    label: "X11",
  },
  [CaptureBackend.SHELL]: {
    isAvailable: hasShellScreenshot,
    capture: captureWithShell,
    label: "Cinnamon Shell",
  },
  [CaptureBackend.GRIM]: {
    isAvailable: hasGrimScreenshot,
    capture: captureWithGrim,
    label: "Wayland (Grim)",
  },
  [CaptureBackend.PORTAL]: {
    isAvailable: hasPortalScreenshot,
    capture: captureWithPortal,
    label: "FreeDesktop Portal",
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

export function isWayland() {
  const sessionType = GLib.getenv("XDG_SESSION_TYPE");
  const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
  return sessionType === "wayland" || (waylandDisplay && waylandDisplay.includes("wayland"));
}
