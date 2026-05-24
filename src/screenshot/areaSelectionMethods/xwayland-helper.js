#!/usr/bin/env gjs -m
/**
 * XWayland Helper Script
 * 
 * This script is spawned as a subprocess with GDK_BACKEND=x11 to force XWayland.
 * It performs the area selection and writes the result to a JSON file.
 * 
 * Usage: gjs -m xwayland-helper.js <background-image-path> <result-json-path>
 */

import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GdkPixbuf from "gi://GdkPixbuf";
import Gio from "gi://Gio";
import system from "system";
import { SelectionDrawer } from "./selectionDrawer.js";

const args = system.programArgs;
let bgImagePath, resultPath;

// Simple heuristic to find args
const cleanArgs = args.filter(a => !a.endsWith(".js") && !a.endsWith(".mjs") && a !== "-m");
if (cleanArgs.length >= 2) {
    bgImagePath = cleanArgs[0];
    resultPath = cleanArgs[1];
} else {
    // Fallback if filtering failed (e.g. if script name is not in args)
    if (args.length >= 2) {
        bgImagePath = args[0];
        resultPath = args[1];
    }
}

if (!bgImagePath || !resultPath) {
    print(`Usage: gjs -m xwayland-helper.js <background-image-path> <result-json-path>`);
    print(`Received args: ${JSON.stringify(args)}`);
    system.exit(1);
}

Gtk.init(null);

const bgPixbuf = GdkPixbuf.Pixbuf.new_from_file(bgImagePath);
let bgSurface = null;
const drawer = new SelectionDrawer();

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
    skip_pager_hint: true,
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
// In X11 fallback (which this is), one big window covering all monitors works fine.
// But we should position it at 0,0
window.move(0, 0);

// Ensure fullscreen
window.fullscreen();

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

window.connect("draw", (widget, cr) => {
    if (!bgSurface && bgPixbuf) {
        bgSurface = Gdk.cairo_surface_create_from_pixbuf(bgPixbuf, 0, widget.get_window());
    }

    drawer.draw(cr, widget, bgSurface, data.rect, { x: 0, y: 0 }, data.buttonPressed);
    return true;
});

const queueDrawRect = (rect) => {
    window.queue_draw_area(
        rect.x - 10, 
        rect.y - 10, 
        rect.width + 20, 
        rect.height + 20
    );
};

window.connect("button-press-event", (widget, event) => {
    if (data.buttonPressed) return true;
    data.buttonPressed = true;
    data.startX = event.get_root_coords()[1];
    data.startY = event.get_root_coords()[2];
    data.rect.x = data.startX;
    data.rect.y = data.startY;
    data.rect.width = 0;
    data.rect.height = 0;
    
    queueDrawRect(data.rect);
    return true;
});

window.connect("motion-notify-event", (widget, event) => {
    if (!data.buttonPressed) return true;
    
    queueDrawRect(data.rect);

    const [, currentX, currentY] = event.get_root_coords();
    data.rect.width = Math.abs(currentX - data.startX);
    data.rect.height = Math.abs(currentY - data.startY);
    data.rect.x = Math.min(data.startX, currentX);
    data.rect.y = Math.min(data.startY, currentY);
    
    queueDrawRect(data.rect);
    return true;
});

const seat = display.get_default_seat();

window.connect("button-release-event", (widget, event) => {
    if (!data.buttonPressed) return true;
    
    queueDrawRect(data.rect);

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
        seat.ungrab();
        window.destroy();
        return true;
    }
    return false;
});

function writeResult() {
    const result = {
        aborted: data.aborted || data.rect.width < 5 || data.rect.height < 5,
        x: Math.round(data.rect.x),
        y: Math.round(data.rect.y),
        width: Math.round(data.rect.width),
        height: Math.round(data.rect.height),
    };

    const file = Gio.File.new_for_path(resultPath);
    const outputStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const encoder = new TextEncoder();
    outputStream.write_all(encoder.encode(JSON.stringify(result)), null);
    outputStream.close(null);
}

window.connect("destroy", () => {
    writeResult();
    // Use system.exit instead of Gtk.main_quit if we didn't start Gtk.main() yet?
    // But we are at the end, Gtk.main() is below.
    Gtk.main_quit();
});

window.show();
const gdkWindow = window.get_window();
const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.CROSSHAIR);
seat.grab(gdkWindow, Gdk.SeatCapabilities.ALL, false, cursor, null, null);

Gtk.main();
