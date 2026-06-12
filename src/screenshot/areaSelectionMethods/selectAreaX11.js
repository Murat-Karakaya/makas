import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import cairo from "gi://cairo";
import { SelectionDrawer } from "./selectionDrawer.js";

/**
 * X11 area selection using GTK POPUP window.
 * Works on X11 sessions and can be used as XWayland fallback on GNOME Wayland.
 *
 * @param {GdkPixbuf.Pixbuf} bgPixbuf - The frozen screenshot to display as background
 * @returns {Promise<{x: number, y: number, width: number, height: number}|null>}
 */
export function selectAreaX11(bgPixbuf) {
    return new Promise((resolve) => {
        print("Selection: selectAreaX11 called");
        if (!bgPixbuf) {
            print("Selection: No background pixbuf provided!");
        }
        /** @type {cairo.Surface} */
        let bgSurface = null;
        const drawer = new SelectionDrawer();

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

        const window = new Gtk.Window({
            type: Gtk.WindowType.TOPLEVEL, // Switches to TopLevel to get VSync from compositor
            decorated: false,
            skip_taskbar_hint: true,
            skip_pager_hint: true,
        });

        // This line skips window manager animations. Window animations are cool but distracting. (Especially Genie)
        window.set_type_hint(Gdk.WindowTypeHint.UTILITY);

        // Ensure window stays on top
        window.set_keep_above(true);

        const display = Gdk.Display.get_default();
        const seat = display.get_default_seat();
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
        window.fullscreen();


        window.add_events(
            Gdk.EventMask.BUTTON_PRESS_MASK |
            Gdk.EventMask.BUTTON_RELEASE_MASK |
            Gdk.EventMask.POINTER_MOTION_MASK |
            Gdk.EventMask.KEY_PRESS_MASK,
        );

        window.connect("draw", (widget, cr) => {
            // 1. Draw the static screenshot background
            if (!bgSurface && bgPixbuf) {
                bgSurface = Gdk.cairo_surface_create_from_pixbuf(
                    bgPixbuf,
                    0,
                    widget.get_window()
                );
            }

            // For X11 popup covering everything, geometry is 0,0
            drawer.draw(cr, widget, bgSurface, data.rect, { x: 0, y: 0 }, data.buttonPressed);
            return true;
        });

        function queueDrawRect(rect) {
             // Invalidate slightly larger area to clear borders
             window.queue_draw_area(
                 rect.x - 10,
                 rect.y - 10,
                 rect.width + 20,
                 rect.height + 20
             );
        };

        let tickId = window.add_tick_callback((widget, frameClock) => {
            // Frame Clock Tick Callback fires perfectly synced with the monitor's refresh rate
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

        window.connect("button-press-event", (widget, event) => {
        		//Starts once exactly when you pressed down and started dragging the mouse.
            if (data.buttonPressed) return true;
            const [, startX, startY] = event.get_root_coords();
            data = {
                buttonPressed: true,
                startX,
                startY,
                currentX: startX,
                currentY: startY,
                rect: { x: startX, y: startY, width: 0, height: 0 },
                aborted: false,
            };

            // Draw initial point
            queueDrawRect(data.rect);
            return true;
        });

        window.connect("motion-notify-event", (widget, event) => {
            if (!data.buttonPressed) return true;

            const [, currentX, currentY] = event.get_root_coords();
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

            const [, currentX, currentY] = event.get_root_coords();
            data.rect.width = Math.abs(currentX - data.startX);
            data.rect.height = Math.abs(currentY - data.startY);
            data.rect.x = Math.min(data.startX, currentX);
            data.rect.y = Math.min(data.startY, currentY);
            if (data.rect.width < 5 || data.rect.height < 5) data.aborted = true;
            seat.ungrab();
            window.destroy();
            return true;
        });

        window.connect("key-press-event", (widget, event) => {
            if (event.get_keyval()[1] === Gdk.KEY_Escape) {
                data.aborted = true;
                data.buttonPressed = false;
                if (tickId) window.remove_tick_callback(tickId);
                seat.ungrab();
                window.destroy();
                return true;
            }
            return false;
        });

        window.connect("destroy", () => {
            if (data.aborted || data.rect.width < 5 || data.rect.height < 5)
                resolve(null);

            resolve({
                x: Math.round(data.rect.x),
                y: Math.round(data.rect.y),
                width: Math.round(data.rect.width),
                height: Math.round(data.rect.height),
            });
        });

        window.connect('map-event', () => {
        		// Put this in map-event to make sure our window grabs
          	// focus after it is mapped. Otherwise it would fail.
           	// we don't want boring old window.present() because the
            // power button press could cause the window to lose focus.
            const gdkWindow = window.get_window();
            const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
            seat.grab(gdkWindow, Gdk.SeatCapabilities.ALL, false, cursor, null, null);
        });

        window.show();
    });
}
