import { settings } from "./utils.js";
import { captureWithX11 } from "./captureMethods/captureX11.js";
import { captureWithShell } from "./captureMethods/captureShell.js";
import { captureWithGrim } from "./captureMethods/captureGrim.js";




export async function performCapture(
    selectionResult,
    { captureMode, includePointer },
) {
    print("Screenshot: Capturing...");
    let pixbuf = null;

    if (settings.get_int("capture-backend") === 0) {
        pixbuf = await captureWithShell(includePointer, captureMode, selectionResult);

        if (pixbuf) return pixbuf;
        print("Screenshot: Shell D-Bus capture failed, falling back to X11");
    } else if (settings.get_int("capture-backend") === 2) {
        pixbuf = await captureWithGrim(includePointer, captureMode, selectionResult);
        if (pixbuf) return pixbuf;
        print("Screenshot: Grim capture failed, falling back to X11");
    }

    pixbuf = await captureWithX11(includePointer, captureMode, selectionResult);
    return pixbuf;
}
