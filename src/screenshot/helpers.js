import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import Wnck from 'gi://Wnck?version=3.0';
import GdkX11 from 'gi://GdkX11?version=3.0';

export function compositePointer(pixbuf) {
    try {
        const display = Gdk.Display.get_default();
        const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.LEFT_PTR);
        const cursorPixbuf = cursor.get_image();

        if (!cursorPixbuf) {
            return pixbuf;
        }

        // Get cursor position
        const seat = display.get_default_seat();
        const pointer = seat.get_pointer();
        const [, x, y] = pointer.get_position();

        // Get cursor hotspot
        const xHotStr = cursorPixbuf.get_option('x_hot');
        const yHotStr = cursorPixbuf.get_option('y_hot');
        const xHot = xHotStr ? parseInt(xHotStr) : 0;
        const yHot = yHotStr ? parseInt(yHotStr) : 0;

        const cursorX = x - xHot;
        const cursorY = y - yHot;

        // Only composite if cursor is within screenshot bounds
        if (cursorX >= 0 && cursorY >= 0 &&
            cursorX < pixbuf.get_width() && cursorY < pixbuf.get_height()) {

            const cursorWidth = Math.min(
                cursorPixbuf.get_width(),
                pixbuf.get_width() - cursorX
            );
            const cursorHeight = Math.min(
                cursorPixbuf.get_height(),
                pixbuf.get_height() - cursorY
            );

            cursorPixbuf.composite(
                pixbuf,
                cursorX, cursorY,
                cursorWidth, cursorHeight,
                cursorX, cursorY,
                1.0, 1.0,
                GdkPixbuf.InterpType.BILINEAR,
                255
            );
        }
    } catch (e) {
        print(`Failed to composite pointer: ${e.message}`);
    }

    return pixbuf;
}
/**
 * Finds the window at (x,y) and returns it as a Gdk.Window 
 * suitable for screenshotting/pixbuf operations.
 */
export function getTargetGdkWindow({x, y}) {
    let screen = Wnck.Screen.get_default();
    screen.force_update();

    let activeWorkspace = screen.get_active_workspace();
    let windows = screen.get_windows_stacked().reverse();
    let foundWnckWindow = null;

    // 1. Find the Wnck Window first (same logic as before)
    for (let i = 0; i < windows.length; i++) {
        let win = windows[i];

        if (!win.is_on_workspace(activeWorkspace) && !win.is_pinned()) continue;
        if (win.get_window_type() === Wnck.WindowType.DESKTOP || 
            win.get_window_type() === Wnck.WindowType.DOCK) continue;

        let [wx, wy, width, height] = win.get_geometry();

        if (x >= wx && x < (wx + width) && y >= wy && y < (wy + height)) {
            foundWnckWindow = win;
            break;
        }
    }

    if (!foundWnckWindow) return null;

    // 2. The Bridge: Convert Wnck (Manager) -> XID -> Gdk (Draw/Read)
    let xid = foundWnckWindow.get_xid();
    let display = Gdk.Display.get_default();
    
    // This creates a Gdk.Window wrapper around the external application's window
    let gdkWindow = GdkX11.X11Window.foreign_new_for_display(display, xid);
    
    // Essential: Ensure Gdk knows about the window events/structure immediately
    if (gdkWindow) {
        gdkWindow.set_events(Gdk.EventMask.STRUCTURE_MASK);
        return gdkWindow;
    }

    return null;
}