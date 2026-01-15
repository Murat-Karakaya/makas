import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import { CaptureMode } from "../constants.js";

const PORTAL_BUS_NAME = "org.freedesktop.portal.Desktop";
const PORTAL_OBJECT_PATH = "/org/freedesktop/portal/desktop";
const PORTAL_SCREENSHOT_INTERFACE = "org.freedesktop.portal.Screenshot";

/**
 * Capture screenshot using FreeDesktop Portal D-Bus API.
 * Works in sandboxed environments and most desktop environments.
 * @param {boolean} includePointer - Whether to include mouse cursor (not supported by Portal, ignored)
 * @param {string} captureMode - The capture mode (SCREEN, WINDOW, AREA)
 * @param {object} params - Parameters for area capture (x, y, width, height), (ignored)
 * @returns {Promise<GdkPixbuf.Pixbuf|null>}
 */
export async function captureWithPortal(includePointer, captureMode, params) {
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
                        resolve(null);
                        return;
                    }

                    const uri = results["uri"];
                    if (!uri) {
                        reject(new Error("Portal returned no URI"));
                        return;
                    }

                    const uriString = uri.unpack ? uri.unpack() : uri;

                    const file = Gio.File.new_for_uri(uriString);
                    const path = file.get_path();

                    let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);

                    try {
                        GLib.unlink(path);
                    } catch (e) {
                        // Ignore cleanup errors
                    }

                    /* Commented out. Because freezing screen is implemented instead.

                    if (captureMode === CaptureMode.AREA && params) {
                        pixbuf = pixbuf.new_subpixbuf(
                            params.x,
                            params.y,
                            params.width,
                            params.height
                        );
                    } */

                    resolve(pixbuf);
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
