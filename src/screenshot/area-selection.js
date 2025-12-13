/**
 * area-selection.js - Interactive area selection for screenshots
 * 
 * Creates a transparent overlay window for rubber-band selection.
 * Works on any X11-based desktop environment.
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import cairo from 'gi://cairo';


/**
 * Show an area selection overlay and return the selected rectangle via callback.
 * @param {Function} callback - Called with {x, y, width, height} or null
 */
export function selectArea(callback) {
    print('Selection: selectArea called');
    const data = {
        rect: { x: 0, y: 0, width: 0, height: 0 },
        buttonPressed: false,
        startX: 0,
        startY: 0,
        aborted: false,
    };

    const screen = Gdk.Screen.get_default();
    const visual = screen.get_rgba_visual();
    const window = new Gtk.Window({
        type: Gtk.WindowType.POPUP,
        decorated: false,
        skip_taskbar_hint: true,
        skip_pager_hint: true
    });

    const display = Gdk.Display.get_default();
    let totalWidth = 0, totalHeight = 0;
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

    window.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.KEY_PRESS_MASK);

    window.connect('draw', (widget, cr) => {
        cr.setOperator(cairo.Operator.SOURCE);
        cr.setSourceRGBA(0, 0, 0, 0.3);
        cr.paint();
        if (data.buttonPressed && data.rect.width > 0 && data.rect.height > 0) {
            const style = widget.get_style_context();
            style.save();
            style.add_class(Gtk.STYLE_CLASS_RUBBERBAND);
            cr.setOperator(cairo.Operator.SOURCE);
            cr.setSourceRGBA(0, 0, 0, 0.1);
            cr.rectangle(data.rect.x, data.rect.y, data.rect.width, data.rect.height);
            cr.fill();
            cr.setOperator(cairo.Operator.OVER);
            cr.setSourceRGBA(0.2, 0.6, 1.0, 0.8);
            cr.setLineWidth(2);
            cr.rectangle(data.rect.x, data.rect.y, data.rect.width, data.rect.height);
            cr.stroke();
            style.restore();
        }
        return true;
    });

    window.connect('button-press-event', (widget, event) => {
        if (data.buttonPressed) return true;
        data.buttonPressed = true;
        data.startX = event.get_root_coords()[1];
        data.startY = event.get_root_coords()[2];
        data.rect.x = data.startX; data.rect.y = data.startY;
        data.rect.width = 0; data.rect.height = 0;
        return true;
    });

    window.connect('motion-notify-event', (widget, event) => {
        if (!data.buttonPressed) return true;
        const [, currentX, currentY] = event.get_root_coords();
        data.rect.width = Math.abs(currentX - data.startX);
        data.rect.height = Math.abs(currentY - data.startY);
        data.rect.x = Math.min(data.startX, currentX);
        data.rect.y = Math.min(data.startY, currentY);
        widget.queue_draw();
        return true;
    });

    window.connect('button-release-event', (widget, event) => {
        if (!data.buttonPressed) return true;
        const [, currentX, currentY] = event.get_root_coords();
        data.rect.width = Math.abs(currentX - data.startX);
        data.rect.height = Math.abs(currentY - data.startY);
        data.rect.x = Math.min(data.startX, currentX);
        data.rect.y = Math.min(data.startY, currentY);
        if (data.rect.width < 5 || data.rect.height < 5) data.aborted = true;
        window.destroy();
        return true;
    });

    window.connect('key-press-event', (widget, event) => {
        if (event.get_keyval()[1] === Gdk.KEY_Escape) {
            data.aborted = true;
            window.destroy();
            return true;
        }
        return false;
    });

    window.connect('destroy', () => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            if (data.aborted || data.rect.width < 5 || data.rect.height < 5) {
                if (callback) callback(null);
            } else {
                if (callback) callback({
                    x: Math.round(data.rect.x),
                    y: Math.round(data.rect.y),
                    width: Math.round(data.rect.width),
                    height: Math.round(data.rect.height),
                });
            }
            return GLib.SOURCE_REMOVE;
        });
    });

    window.show();
    const gdkWindow = window.get_window();
    const seat = display.get_default_seat();
    const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
    seat.grab(gdkWindow, Gdk.SeatCapabilities.ALL, false, cursor, null, null);
}

/**
 * Show window selection cursor and return click position via callback.
 * @param {Function} callback - Called with {x, y} or null.
 */
export function selectWindow(callback) {
    print('Selection: selectWindow (callback) called');
    let aborted = false;
    const screen = Gdk.Screen.get_default();
    const visual = screen.get_rgba_visual();
    const window = new Gtk.Window({ type: Gtk.WindowType.POPUP, decorated: false, skip_taskbar_hint: true, skip_pager_hint: true });

    const display = Gdk.Display.get_default();
    let totalWidth = 0, totalHeight = 0;
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

    window.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.KEY_PRESS_MASK);

    window.connect('draw', (widget, cr) => {
        cr.setOperator(cairo.Operator.SOURCE);
        cr.setSourceRGBA(0, 0, 0, 0.01);
        cr.paint();
        return true;
    });

    window.connect('button-press-event', (widget, event) => {
        const [, x, y] = event.get_root_coords();
        window.destroy();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            if (!aborted && callback) callback({ x: Math.round(x), y: Math.round(y) });
            return GLib.SOURCE_REMOVE;
        });
        return true;
    });

    window.connect('key-press-event', (widget, event) => {
        if (event.get_keyval()[1] === Gdk.KEY_Escape) {
            aborted = true;
            window.destroy();
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                if (callback) callback(null);
                return GLib.SOURCE_REMOVE;
            });
            return true;
        }
        return false;
    });

    window.show();
    const gdkWindow = window.get_window();
    const seat = display.get_default_seat();
    const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
    seat.grab(gdkWindow, Gdk.SeatCapabilities.ALL, false, cursor, null, null);
}
