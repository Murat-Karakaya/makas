import { captureWithX11 } from "./captureMethods/captureX11.js";
import { captureWithShell } from "./captureMethods/captureShell.js";
import { captureWithGrim } from "./captureMethods/captureGrim.js";
import { CaptureBackend } from "./constants.js";




export async function performCapture(
    selectionResult,
    captureBackendValue,
    { captureMode, includePointer },
) {
    print("Screenshot: Capturing...");
    let pixbuf = null;

    if (captureBackendValue === CaptureBackend.SHELL) {
        pixbuf = await captureWithShell(includePointer, captureMode, selectionResult);

        if (pixbuf) return pixbuf;
        print("Screenshot: Shell D-Bus capture failed, falling back to X11");
    } else if (captureBackendValue === CaptureBackend.GRIM) {
        pixbuf = await captureWithGrim(includePointer, captureMode, selectionResult);
        if (pixbuf) return pixbuf;
        print("Screenshot: Grim capture failed, falling back to X11");
    }

    pixbuf = await captureWithX11(includePointer, captureMode, selectionResult);
    return pixbuf;
}
