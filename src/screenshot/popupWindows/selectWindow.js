import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GLib from "gi://GLib";
import cairo from "gi://cairo";

/**
 * Show window selection cursor and return click position.
 * @returns {Promise<{window, width, height}|null>}
 */
export function selectWindow() {
    return new Promise((resolve) => {
        let aborted = false;
        const screen = Gdk.Screen.get_default();
        const visual = screen.get_rgba_visual();
        const window = new Gtk.Window({
            type: Gtk.WindowType.POPUP,
            decorated: false,
            skip_taskbar_hint: true,
            skip_pager_hint: true,
        });

        const display = Gdk.Display.get_default();
        let totalWidth = 0,
            totalHeight = 0;
        const nMonitors = display.get_n_monitors();
        for (let i = 0; i < nMonitors; i++) {
            const monitor = display.get_monitor(i);
            const geom = monitor.get_geometry();
            totalWidth = Math.max(totalWidth, geom.x + geom.width);
            totalHeight = Math.max(totalHeight, geom.y + geom.height);
        }
        window.set_default_size(totalWidth, totalHeight);
        window.move(0, 0);

        if (screen.is_composited() && visual) {
            window.set_visual(visual);
            window.set_app_paintable(true);
        }

        window.add_events(
            Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.KEY_PRESS_MASK,
        );

        window.connect("draw", (widget, cr) => {
            cr.setOperator(cairo.Operator.SOURCE);
            cr.setSourceRGBA(0, 0, 0, 0.01);
            cr.paint();
            return true;
        });

        const seat = display.get_default_seat();

        window.connect("button-press-event", (widget, event) => {
            const [, x, y] = event.get_root_coords();
            seat.ungrab();
            window.destroy();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                if (!aborted) {
                    resolve({
                        clickX: Math.round(x),
                        clickY: Math.round(y),
                    });
                } else {
                    resolve(null);
                }
                return GLib.SOURCE_REMOVE;
            });
            return true;
        });

        window.connect("key-press-event", (widget, event) => {
            if (event.get_keyval()[1] === Gdk.KEY_Escape) {
                aborted = true;
                seat.ungrab();
                window.destroy();
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                    resolve(null);
                    return GLib.SOURCE_REMOVE;
                });
                return true;
            }
            return false;
        });

        window.show();
        const gdkWindow = window.get_window();
        const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
        seat.grab(gdkWindow, Gdk.SeatCapabilities.ALL, false, cursor, null, null);
    });
}
