import Gtk from "gi://Gtk?version=3.0";
import GLib from "gi://GLib";
import Cairo from "cairo";
import { wait, settings } from "../utils.js";

/**
 * Check if we're running on Wayland.
 * @returns {boolean}
 */
function isWayland() {
    return GLib.getenv("XDG_SESSION_TYPE") === "wayland" || !!GLib.getenv("WAYLAND_DISPLAY");
}

/**
 * Flash a rectangular region on the screen with a simple white overlay.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
export async function flashRect(x, y, width, height) {
    // Check if flash is enabled
    if (!settings.get_boolean("enable-flash")) {
        return;
    }

    await wait(100); // wait to avoid lag in the main window and a possible race condition with the screenshot

    const onWayland = isWayland();

    const win = new Gtk.Window({
        type: Gtk.WindowType.POPUP,
        decorated: false,
    });

    win.set_keep_above(true);
    win.fullscreen(); // Flash the entire screen if the app can't position itself
    win.move(x, y);
    win.set_default_size(width, height);

    const screen = win.get_screen();
    const visual = screen.get_rgba_visual();

    // On Wayland, skip transparency - use opaque flash
    const useTransparency = !onWayland && visual && screen.is_composited();

    if (visual) {
        win.set_visual(visual);
    }
    win.set_app_paintable(true);

    win.set_opacity(useTransparency ? 0 : 1);

    win.connect("draw", (widget, cr) => {
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.paint();
        return false;
    });

    win.show_all();

    // On Wayland or non-composited: show briefly then destroy (no animation)
    if (!useTransparency) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            win.destroy();
            return GLib.SOURCE_REMOVE;
        });
        return;
    }

    // Animated fade-out for X11 with compositing
    const duration = 300;
    const fps = 60;
    const interval = 1000 / fps;
    const steps = duration / interval;

    let currentStep = 0;

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        if (currentStep >= steps) {
            win.destroy();
            return GLib.SOURCE_REMOVE;
        }

        // Progress from 0 to 1
        const t = currentStep / steps;

        // "Cheese Flash" Formula:
        // Starts at 1.0 when t=0, decays to 0.0 as t approaches 1.
        // Using (1 - t)^3 creates a very sharp start with a long, thinning tail.
        const newOpacity = Math.pow(1 - t, 3);
        win.set_opacity(newOpacity);

        currentStep++;
        return GLib.SOURCE_CONTINUE;
    });
}