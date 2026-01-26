import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import { CaptureMode } from "../constants.js";

const PORTAL_BUS_NAME = "org.freedesktop.portal.Desktop";
const PORTAL_OBJECT_PATH = "/org/freedesktop/portal/desktop";
const PORTAL_SCREENSHOT_INTERFACE = "org.freedesktop.portal.Screenshot";
let isAvailable = null;

export async function captureWithPortal({ captureMode }) {
    if (captureMode === CaptureMode.WINDOW) {
        throw new Error("Window capture isn't supported in Portal Backend. Please use a different backend for window capture.");
    }

    const connection = Gio.DBus.session;
    const senderName = connection.get_unique_name().replace(/^:/, "").replace(/\./g, "_");
    const token = `makas_${Date.now()}`;
    const requestPath = `/org/freedesktop/portal/desktop/request/${senderName}/${token}`;

    return new Promise((resolve, reject) => {
        let signalId = null;

        signalId = connection.signal_subscribe(
            PORTAL_BUS_NAME,
            "org.freedesktop.portal.Request",
            "Response",
            requestPath,
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, parameters) => {
                if (signalId) {
                    connection.signal_unsubscribe(signalId);
                    signalId = null;
                }

                try {
                    const [responseCode, results] = parameters.deep_unpack();

                    if (responseCode !== 0) {
                        reject(new Error("Not allowed to take screenshot"));
                        return;
                    }

                    const uri = results?.uri;

                    const uriString = uri?.unpack?.() ?? uri;

                    if (!uriString) {
                        reject(new Error("Portal returned no URI"));
                        return;
                    }

                    const file = Gio.File.new_for_uri(uriString);
                    const path = file.get_path();

                    let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);

                    try {
                        GLib.unlink(path);
                    } catch (e) {
                        // Ignore cleanup errors
                    }

                    resolve({
                        x: 0,
                        y: 0,
                        pixbuf,
                    });
                } catch (e) {
                    reject(e);
                }
            }
        );

        try {
            const options = {
                "handle_token": new GLib.Variant("s", token),
            };

            connection.call(
                PORTAL_BUS_NAME,
                PORTAL_OBJECT_PATH,
                PORTAL_SCREENSHOT_INTERFACE,
                "Screenshot",
                new GLib.Variant("(sa{sv})", ["", options]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (conn, res) => {
                    try {
                        conn.call_finish(res);
                    } catch (e) {
                        if (signalId) {
                            connection.signal_unsubscribe(signalId);
                            signalId = null;
                        }
                        reject(e);
                    }
                }
            );
        } catch (e) {
            if (signalId) {
                connection.signal_unsubscribe(signalId);
                signalId = null;
            }
            reject(e);
        }
    });
}


export function hasPortalScreenshot() {
  if (isAvailable !== null) return isAvailable;

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
    return isAvailable = true;
  } catch (e) {
    return isAvailable = false;
  }
}
