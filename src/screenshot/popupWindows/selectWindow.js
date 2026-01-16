import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GLib from "gi://GLib";
import Cairo from "cairo";

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
            const width = widget.get_allocated_width();
            const height = widget.get_allocated_height();

            if (screen.is_composited() && visual) {
                // Tint the screen
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceRGBA(0, 0, 0, 0.4);
                cr.paint();

                // Draw a thinner red border frame
                cr.setOperator(Cairo.Operator.OVER);
                cr.setSourceRGBA(1, 0, 0, 0.8); // Bright red, semi-transparent
                cr.setLineWidth(2);
                cr.rectangle(1, 1, width - 2, height - 2);
                cr.stroke();
            } else {
                // Clear to fully transparent
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceRGBA(0, 0, 0, 0);
                cr.paint();

                // Draw a visible 10px red border frame
                cr.setOperator(Cairo.Operator.OVER);
                cr.setSourceRGBA(1, 0, 0, 0.8); // Bright red, semi-transparent
                cr.setLineWidth(4);
                cr.rectangle(2, 2, width - 4, height - 4);
                cr.stroke();
            }

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

        if (!(screen.is_composited() && visual)) {
            try {
                // Shape the window to make only the outline visible
                const region = new Cairo.Region();
                region.unionRectangle({ x: 0, y: 0, width: totalWidth, height: totalHeight });
                region.subtractRectangle({ x: 4, y: 4, width: totalWidth - 8, height: totalHeight - 8 });

                gdkWindow.shape_combine_region(region, 0, 0);
            } catch (e) {
                print("Failed to shape window:", e);
            }
        }

        const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
        seat.grab(gdkWindow, Gdk.SeatCapabilities.ALL, false, cursor, null, null);
    });
}
