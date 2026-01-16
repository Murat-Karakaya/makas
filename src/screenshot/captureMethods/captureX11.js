import Gdk from "gi://Gdk?version=3.0";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import { CaptureMode } from "../constants.js";
import { getScreenshotHelper } from "../utils.js";
import { flashRect } from "../popupWindows/flash.js";


export function captureWithX11(includePointer, captureMode, selectionResult) {
    let pixbuf;
    switch (captureMode) {
        case CaptureMode.SCREEN: {
            const rootWindow = Gdk.get_default_root_window();
            pixbuf = Gdk.pixbuf_get_from_window(
                rootWindow,
                0,
                0,
                rootWindow.get_width(),
                rootWindow.get_height(),
            );
            if (includePointer) {
                compositeCursor(pixbuf, 0, 0);
            }

            flashRect(0, 0, pixbuf.get_width(), pixbuf.get_height());
            break;
        }
        case CaptureMode.WINDOW: {
            if (selectionResult && selectionResult.clickX !== undefined) {
                const result = captureWindowWithXShape(
                    selectionResult.clickX,
                    selectionResult.clickY
                );

                if (result) {
                    pixbuf = result.pixbuf;
                    if (includePointer) {
                        compositeCursor(pixbuf, result.offsetX, result.offsetY);
                    }

                    flashRect(result.offsetX, result.offsetY, pixbuf.get_width(), pixbuf.get_height());
                }
            }
            break;
        }
        /* Commented out. Because freezing screen is implemented instead.
        case CaptureMode.AREA:
            if (selectionResult) {
                const rootWindow = Gdk.get_default_root_window();
                pixbuf = Gdk.pixbuf_get_from_window(
                    rootWindow,
                    selectionResult.x,
                    selectionResult.y,
                    selectionResult.width,
                    selectionResult.height,
                );
                if (includePointer) {
                    compositeCursor(pixbuf, selectionResult.x, selectionResult.y);
                }
            }
            break;
        */
        case CaptureMode.AREA: {
            const rootWindow = Gdk.get_default_root_window();
            pixbuf = Gdk.pixbuf_get_from_window(
                rootWindow,
                0,
                0,
                rootWindow.get_width(),
                rootWindow.get_height(),
            );
            if (includePointer) {
                compositeCursor(pixbuf, 0, 0);
            }
            break;
        }
    }
    return pixbuf;
}



function compositeCursor(pixbuf, rootX, rootY) {
    const display = Gdk.Display.get_default();
    const seat = display.get_default_seat();
    const pointer = seat.get_pointer();

    const [_, x, y] = pointer.get_position();

    // Create cursor to get its image
    // Note: This creates a standard arrow cursor. Getting the *actual* current cursor image 
    // is quite complex
    const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.LEFT_PTR);
    const cursorPixbuf = cursor.get_image();

    if (!cursorPixbuf) return;
    let hotX = 0;
    let hotY = 0;
    try {
        const hotXStr = cursorPixbuf.get_option("x_hot");
        const hotYStr = cursorPixbuf.get_option("y_hot");
        if (hotXStr) hotX = +hotXStr; // hotX/YStr is actually a string. But the type is coerted into an int.
        if (hotYStr) hotY = +hotYStr; // Seems fishy but you gotta live life on the edge from time to time.

    } catch (e) {
        print(e);
    }

    const destX = x - rootX - hotX;
    const destY = y - rootY - hotY;

    const pbWidth = pixbuf.get_width();
    const pbHeight = pixbuf.get_height();
    const curWidth = cursorPixbuf.get_width();
    const curHeight = cursorPixbuf.get_height();

    const interX = Math.max(0, destX);
    const interY = Math.max(0, destY);
    const interRight = Math.min(pbWidth, destX + curWidth);
    const interBottom = Math.min(pbHeight, destY + curHeight);
    const interW = interRight - interX;
    const interH = interBottom - interY;

    if (interW > 0 && interH > 0) {
        cursorPixbuf.composite(
            pixbuf,
            interX,
            interY,
            interW,
            interH,
            destX,
            destY,
            1.0,
            1.0,
            GdkPixbuf.InterpType.BILINEAR,
            255
        );
    }
}


function captureWindowWithXShape(x, y) {
    const helper = getScreenshotHelper();
    // GJS handles (out) arguments by returning an array: [return_val, out_arg1, out_arg2, ...]
    const result = helper.capture_window(x, y);

    if (!result || !result[0]) return null;

    return {
        pixbuf: result[0],
        offsetX: result[1],
        offsetY: result[2]
    };
}