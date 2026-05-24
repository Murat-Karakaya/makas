import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";
import { CaptureMode } from "../constants.js";

let isAvailable = null;

/**
 * Capture the screen using the native Wayland capture implementation.
 * Tries ext-image-copy-capture first, then falls back to wlr-screencopy.
 */
export async function captureWithWayland({ includePointer, captureMode }) {
    if (captureMode === CaptureMode.WINDOW) {
        throw new Error("Window capture isn't supported in Wayland Backend. Please use a different backend for window capture.");
    }

    // Try ext-image-copy-capture first (newer, standard protocol)
    let pixbuf = MakasScreenshot.capture_ext_image_copy(includePointer);

    // Fall back to wlr-screencopy (older, wlroots-specific protocol)
    if (!pixbuf) {
        pixbuf = MakasScreenshot.capture_screencopy(includePointer);
    }

    if (!pixbuf) {
        throw new Error("Wayland capture failed: no supported capture protocol available");
    }

    return {
        x: 0,
        y: 0,
        pixbuf,
    };
}

/**
 * Check if the native Wayland capture is available.
 * No external binary is required — we use the native C implementation.
 */
export function hasWaylandScreenshot() {
    if (isAvailable !== null) return isAvailable;

    const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
    if (!waylandDisplay) return isAvailable = false;

    try {
        return isAvailable = MakasScreenshot.utils_is_grim_supported();
    } catch (e) {
        console.error("Failed to check Wayland capture availability:", e);
        return isAvailable = false;
    }
}
