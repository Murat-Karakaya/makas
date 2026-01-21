import Gdk from "gi://Gdk?version=3.0";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";
import { CaptureMode } from "../constants.js";
import { flashRect } from "../popupWindows/flash.js";
import { selectWindow } from "../popupWindows/selectWindow.js";


let screenshotHelper = null;
function getScreenshotHelper() {
  if (!screenshotHelper) {
    screenshotHelper = MakasScreenshot.Screenshot.new();
  }
  return screenshotHelper;
}

let isAvailable = null;

export async function captureWithX11({ includePointer, captureMode }) {
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
            const selectionResult = await selectWindow();

            if (!selectionResult) return null;

            const result = captureWindowWithXShape(
                selectionResult.clickX,
                selectionResult.clickY
            );
            if (!result) break;
            pixbuf = result.pixbuf;
            if (includePointer) {
                compositeCursor(pixbuf, result.offsetX, result.offsetY);
            }

            flashRect(result.offsetX, result.offsetY, pixbuf.get_width(), pixbuf.get_height());
            break;
        }
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

    if (!pixbuf) throw new Error("Pixbuf is null");
    return pixbuf;
}


export function hasX11Screenshot() {
  if (isAvailable !== null) return isAvailable;
  return isAvailable = GLib.getenv("XDG_SESSION_TYPE") === "x11";
}



function compositeCursor(pixbuf, rootX, rootY) {
    try {
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
        const hotX = +cursorPixbuf.get_option("x_hot");
        const hotY = +cursorPixbuf.get_option("y_hot");

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
    } catch (e) {
        print(`Cursor not implemented: ${e}`);
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