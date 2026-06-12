import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import cairo from "gi://cairo";
import GtkLayerShell from "gi://GtkLayerShell";
import { SelectionDrawer } from "./selectionDrawer.js";

/**
 * Layer Shell area selection for wlroots-based compositors.
 * Uses gtk-layer-shell to create a fullscreen overlay on all monitors.
 *
 * @param {GdkPixbuf.Pixbuf} bgPixbuf - The frozen screenshot to display as background
 * @returns {Promise<{x: number, y: number, width: number, height: number, monitor_scale: number}|null>}
 */
export function selectAreaLayerShell(bgPixbuf) {
    return new Promise((resolve) => {
        print("Selection: selectAreaLayerShell called");

        const display = Gdk.Display.get_default();
        const seat = display.get_default_seat();
        const nMonitors = display.get_n_monitors();
        const windows = [];
        let resolved = false;

        const drawer = new SelectionDrawer();

        // Shared state
        let data = {
            rect: { x: 0, y: 0, width: 0, height: 0 },
            buttonPressed: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            mouseMoved: false,
            aborted: false,
        };

        /** @type {cairo.Surface} */
        let bgSurface = null;

        for (let i = 0; i < nMonitors; i++) {
            const monitor = display.get_monitor(i);
            const geometry = monitor.get_geometry();

            // Create window
            const window = new Gtk.Window({
                type: Gtk.WindowType.TOPLEVEL,
                decorated: false,
            });

            // Initialize layer shell
            GtkLayerShell.init_for_window(window);
            GtkLayerShell.set_monitor(window, monitor);
            GtkLayerShell.set_layer(window, GtkLayerShell.Layer.OVERLAY);

            // Anchor to all edges
            GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.TOP, true);
            GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.BOTTOM, true);
            GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.LEFT, true);
            GtkLayerShell.set_anchor(window, GtkLayerShell.Edge.RIGHT, true);

            // Exclusive zone -1 to obtain keyboard focus but let it stay behind lockscreens if needed (though OVERLAY puts it on top)
            // Using -1 means we don't reserve space.
            GtkLayerShell.set_exclusive_zone(window, -1);

            // Enable keyboard interactivity (only needs to be set on one window really)
            GtkLayerShell.set_keyboard_mode(window, GtkLayerShell.KeyboardMode.EXCLUSIVE);

            window.add_events(
                Gdk.EventMask.BUTTON_PRESS_MASK |
                Gdk.EventMask.BUTTON_RELEASE_MASK |
                Gdk.EventMask.POINTER_MOTION_MASK |
                Gdk.EventMask.KEY_PRESS_MASK
            );

            // Drawing
            window.connect("draw", (widget, cr) => {
                // 1. Draw background
                if (!bgSurface && bgPixbuf) {
                    bgSurface = Gdk.cairo_surface_create_from_pixbuf(
                        bgPixbuf,
                        0,
                        widget.get_window()
                    );
                }

                drawer.draw(cr, widget, bgSurface, data.rect, geometry, data.buttonPressed);
                return true;
            });

            let tickId = window.add_tick_callback((widget, frameClock) => {
                if (!data.buttonPressed) return true;

                if (data.mouseMoved) {
                    // 1. Invalidate the old bounding box position
                    queueDrawRect(data.rect);

                    // 2. Calculate the updated math
                    data.rect.width = Math.abs(data.currentX - data.startX);
                    data.rect.height = Math.abs(data.currentY - data.startY);
                    data.rect.x = Math.min(data.startX, data.currentX);
                    data.rect.y = Math.min(data.startY, data.currentY);

                    // 3. Invalidate the new bounding box position
                    queueDrawRect(data.rect);
                    data.mouseMoved = false;
                }
                return true;
            });

            // Events
            window.connect("button-press-event", (widget, event) => {
                if (data.buttonPressed) return true;

                // Global coordinates:
                const [, localX, localY] = event.get_coords();
                const rootX = localX + geometry.x;
                const rootY = localY + geometry.y;

                data = {
                    buttonPressed: true,
                    startX: rootX,
                    startY: rootY,
                    currentX: rootX,
                    currentY: rootY,
                    rect: { x: rootX, y: rootY, width: 0, height: 0 },
                    aborted: false,
                };
                // Grab interactions
                const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
                seat.grab(widget.get_window(), Gdk.SeatCapabilities.ALL_POINTING, false, cursor, null, null);

                queueDrawRect(data.rect);
                return true;
            });

            window.connect("motion-notify-event", (widget, event) => {
                if (!data.buttonPressed) return true;

                const [, localX, localY] = event.get_coords();
                const currentX = localX + geometry.x;
                const currentY = localY + geometry.y;

                data.currentX = currentX;
                data.currentY = currentY;
                data.mouseMoved = true; // Let the tick callback handle the redraw request safely
                return true;
            });

            window.connect("button-release-event", (widget, event) => {
                if (!data.buttonPressed) return true;
                data.buttonPressed = false;

                if (tickId) {
                    window.remove_tick_callback(tickId);
                    tickId = null;
                }

                // We are adding the geometry  coords to prevent rectangle offset
                const [, localX, localY] = event.get_coords();
                const currentX = localX + geometry.x;
                const currentY = localY + geometry.y;

                data.rect.width = Math.abs(currentX - data.startX);
                data.rect.height = Math.abs(currentY - data.startY);
                data.rect.x = Math.min(data.startX, currentX);
                data.rect.y = Math.min(data.startY, currentY);

                finish();
                return true;
            });

            window.connect("key-press-event", (widget, event) => {
                if (event.get_keyval()[1] === Gdk.KEY_Escape) {
                    data.aborted = true;
                    data.buttonPressed = false;
                    if (tickId) window.remove_tick_callback(tickId);
                    cleanup();
                    resolve(null); // Resolve immediately on abort
                    return true;
                }
                return false;
            });

            windows.push({ window, geometry });
        }

        // Show all windows
        for (const { window } of windows) {
            window.show();
            const gdkWin = window.get_window();
            if (gdkWin) {
                const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
                gdkWin.set_cursor(cursor);
            }
        };

        // Cleaning up all windows
        function cleanup() {
            if (resolved) return;
            resolved = true;

            // Release grab if any
            try {
                seat.ungrab();
            } catch (e) {
                print("Error ungrabbing seat: " + e);
            }

            windows.forEach(({ window }) => {
                try {
                    window.destroy();
                } catch (e) {
                    // ignore
                }
            });
        };

        function finish() {
            if (data.aborted || data.rect.width < 5 || data.rect.height < 5) {
              resolve(null);
            } else {
              resolve({
                  x: Math.round(data.rect.x),
                  y: Math.round(data.rect.y),
                  width: Math.round(data.rect.width),
                  height: Math.round(data.rect.height),
              });
            }
            cleanup();
        };

        function queueDrawRect(rect) {
            const pad = 10;
            const globalX = rect.x - pad;
            const globalY = rect.y - pad;
            const globalW = rect.width + 2 * pad;
            const globalH = rect.height + 2 * pad;

            for (const { window, geometry } of windows) {
                const localX = globalX - geometry.x;
                const localY = globalY - geometry.y;
                window.queue_draw_area(localX, localY, globalW, globalH);
            }
        };

    });
}
