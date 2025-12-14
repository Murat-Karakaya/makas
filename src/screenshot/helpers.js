import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';

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