import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import cairo from "gi://cairo";
import GtkLayerShell from "gi://GtkLayerShell";

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

        // Shared state
        const data = {
            rect: { x: 0, y: 0, width: 0, height: 0 },
            buttonPressed: false,
            startX: 0,
            startY: 0,
            aborted: false,
            activeWindow: null // The window where the drag started
        };

        /** @type {cairo.Surface} */
        let bgSurface = null;

        // Cleaning up all windows
        const cleanup = () => {
            if (resolved) return;
            resolved = true;

            // Release grab if any
            try {
                seat.ungrab();
            } catch (e) {
                print("Error ungrabbing seat: " + e);
            }

            windows.forEach(w => {
                try {
                    w.destroy();
                } catch (e) {
                    // ignore
                }
            });
        };

        const finish = () => {
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

        for (let i = 0; i < nMonitors; i++) {
            const monitor = display.get_monitor(i);
            const scale = monitor.get_scale_factor();
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

            // Enable keyboard interactivity (only needs to be set on one window really, but setting on all is safer)
            GtkLayerShell.set_keyboard_mode(window, GtkLayerShell.KeyboardMode.EXCLUSIVE);

            const screen = window.get_screen();
            const visual = screen.get_rgba_visual();
            if (screen.is_composited() && visual) {
                window.set_visual(visual);
                window.set_app_paintable(true);
            }

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
                    // Create a surface for the whole virtual screen? 
                    // Or create a surface from the part of pixbuf corresponding to this monitor?
                    // The passed bgPixbuf is likely the full screenshot.
                    // On X11/cairo, simply drawing the pixbuf at (0,0) might draw the top-left of pixbuf.
                    // But this window corresponds to a specific monitor with specific geometry.
                    // We need to translate coordinates.
                    // Wait, `selectWindow.js` (not seen here) or `capturePortal.js` returns a full pixbuf?
                    // Assuming bgPixbuf covers the virtual screen (all monitors combined).
                    // Ideally we should crop the bgPixbuf for this monitor, OR translate the drawing.

                    // Currently simple implementation:
                    bgSurface = Gdk.cairo_surface_create_from_pixbuf(
                        bgPixbuf,
                        0,
                        widget.get_window()
                    );
                }

                // If bgSurface is the full screenshot, we need to draw it offset by -geometry.x, -geometry.y
                // But `widget` allocation (0,0) in LayerShell usually maps to the monitor origin? 
                // No, GtkLayerShell window coordinates are local to the window.
                // So (0,0) in the window is the top-left of the monitor.
                // The monitor is at (geometry.x, geometry.y) in global coordinates.
                // So we should draw the bgSurface at (-geometry.x, -geometry.y).

                if (bgSurface) {
                    cr.setSourceSurface(bgSurface, -geometry.x, -geometry.y);
                    cr.paint();
                } else {
                    cr.setSourceRGBA(0, 0, 0, 0.3);
                    cr.paint();
                }

                // 2. Dim overlay
                cr.setOperator(cairo.Operator.OVER);
                cr.setSourceRGBA(0, 0, 0, 0.4);

                const w = widget.get_allocated_width();
                const h = widget.get_allocated_height();

                // If we have a selection active, we need to subtract it from the dim overlay.
                // The selection `data.rect` is in GLOBAL coordinates.
                // We need to intersect it with this window's geometry.

                let selX = data.rect.x;
                let selY = data.rect.y;
                let selW = data.rect.width;
                let selH = data.rect.height;

                // Intersect selection with current window geometry
                // Window origin in global space is (geometry.x, geometry.y)

                // Convert global selection to local coordinates
                let localSelX = selX - geometry.x;
                let localSelY = selY - geometry.y;

                // Simple verify: just draw dim everywhere, then clear the selection rect
                // But clearing means restoring the background... which is complicated if we already painted it.
                // Standard approach: Path = Full Rect - Selection Rect. Fill with dim color.

                // Add outer rectangle
                cr.rectangle(0, 0, w, h);

                // Subtract selection rectangle if it overlaps this window
                if (selW > 0 && selH > 0) {
                    // Check intersection
                    // We can just add a negative rectangle or using EvenOdd rule?
                    // Easier: using logic.
                    // rectangle(localSelX, localSelY, selW, selH) with negative direction?
                    // Cairo allows winding rules.

                    cr.rectangle(localSelX + selW, localSelY, -selW, selH);
                }
                cr.fill();

                // 3. Selection Border
                if (data.buttonPressed && selW > 0 && selH > 0) {
                    const style = widget.get_style_context();
                    style.save();
                    style.add_class(Gtk.STYLE_CLASS_RUBBERBAND);
                    cr.setSourceRGBA(0.2, 0.6, 1.0, 0.8);
                    cr.setLineWidth(2 * scale); // Scale the border
                    cr.rectangle(localSelX, localSelY, selW, selH);
                    cr.stroke();
                    style.restore();
                }

                return true;
            });

            // Events
            window.connect("button-press-event", (widget, event) => {
                if (data.buttonPressed) return true;
                data.buttonPressed = true;
                data.activeWindow = widget;

                // Global coordinates:
                const [, localX, localY] = event.get_coords();
                const rootX = localX + geometry.x;
                const rootY = localY + geometry.y;
                data.startX = rootX;
                data.startY = rootY;
                data.rect.x = rootX;
                data.rect.y = rootY;
                data.rect.width = 0;
                data.rect.height = 0;

                // Grab interactions
                const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
                seat.grab(widget.get_window(), Gdk.SeatCapabilities.ALL_POINTING, false, cursor, null, null);

                queueDrawAll();
                return true;
            });

            window.connect("motion-notify-event", (widget, event) => {
                if (!data.buttonPressed) return true;

                const [, localX, localY] = event.get_coords();
                const currentX = localX + geometry.x;
                const currentY = localY + geometry.y;

                data.rect.width = Math.abs(currentX - data.startX);
                data.rect.height = Math.abs(currentY - data.startY);
                data.rect.x = Math.min(data.startX, currentX);
                data.rect.y = Math.min(data.startY, currentY);

                queueDrawAll();
                return true;
            });

            window.connect("button-release-event", (widget, event) => {
                if (!data.buttonPressed) return true;

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
                    cleanup();
                    resolve(null); // Resolve immediately on abort
                    return true;
                }
                return false;
            });

            windows.push(window);
        }

        function queueDrawAll() {
            windows.forEach(w => w.queue_draw());
        }

        // Show all windows
        windows.forEach(w => {
            w.show();
            // Set cursor for each window surface
            // Note: Layer Shell windows don't have a typical GdkWindow until mapped?
            // We can try setting cursor after realize.
        });

        // Post-show cursor setting
        windows.forEach(w => {
            const gdkWin = w.get_window();
            if (gdkWin) {
                const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
                gdkWin.set_cursor(cursor);
            }
        });

        // We do NOT do a global grab here. The windows are overlay, so they should catch input.
    });
}

/**
 * Check if gtk-layer-shell is available.
 * @returns {boolean}
 */
export function hasLayerShell() {
    try {
        const GtkLayerShell = imports.gi.GtkLayerShell;
        return GtkLayerShell !== undefined;
    } catch (e) {
        return false;
    }
}
