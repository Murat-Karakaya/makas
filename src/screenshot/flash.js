import Gtk from "gi://Gtk?version=3.0";
import GLib from "gi://GLib";
import Cairo from "cairo";

/**
 * Flash a rectangular region on the screen with a simple white overlay.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
export function flashRect(x, y, width, height) {
    const win = new Gtk.Window({
        type: Gtk.WindowType.POPUP,
        decorated: false,
    });

    win.set_keep_above(true);
    win.move(x, y);
    win.set_default_size(width, height);

    const screen = win.get_screen();
    const visual = screen.get_rgba_visual();
    if (visual) {
        win.set_visual(visual);
    }
    win.set_app_paintable(true);

    win.set_opacity(0);

    win.connect("draw", (widget, cr) => {
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.paint();
        return false;
    });

    win.show_all();

    const duration = 500;
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