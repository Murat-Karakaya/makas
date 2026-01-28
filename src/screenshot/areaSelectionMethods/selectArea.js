import { selectAreaX11 } from "./selectAreaX11.js";
import { isWayland } from "../utils.js";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";

/**
 * Select screen area using the appropriate backend for the current environment.
 * 
 * @param {GdkPixbuf.Pixbuf} bgPixbuf - The frozen screenshot to display as background
 * @returns {Promise<{x: number, y: number, width: number, height: number}|null>}
 */
export async function selectArea(bgPixbuf) {
    const wayland = isWayland();

    let hasLayerShell = false;
    if (wayland) {
        try {
            hasLayerShell = MakasScreenshot.utils_is_layer_shell_supported();
        } catch (e) {
            console.error("Failed to check Layer Shell availability:", e);
        }
    }

    print(`Area selection: wayland=${wayland}, hasLayerShell=${hasLayerShell}`);

    if (!wayland) {
        // X11 session - use native GTK POPUP
        print("Using X11 area selection");
        return selectAreaX11(bgPixbuf);
    }

    // If layer shell is available, use it (works on Sway, Hyprland, etc.)
    if (hasLayerShell) {
        print("Using Layer Shell area selection");
        try {
            const { selectAreaLayerShell } = await import("./selectAreaLayerShell.js");
            return selectAreaLayerShell(bgPixbuf);
        } catch (e) {
            print(`Layer Shell execution failed: ${e.message}, falling back to X11 or XWayland`);
        }
    }

    // Fallback for Wayland environments without layer shell (like GNOME)
    // We try XWayland method which uses GDK_BACKEND=x11 subprocess
    print("Layer Shell not available or failed, trying XWayland fallback");
    try {
        const { selectAreaXWayland } = await import("./selectAreaXWayland.js");
        return selectAreaXWayland(bgPixbuf);
    } catch (e) {
        print(`XWayland fallback failed: ${e.message}, falling back to direct X11`);
        return selectAreaX11(bgPixbuf);
    }
}
