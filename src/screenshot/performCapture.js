import { captureWithX11 } from "./captureMethods/captureX11.js";
import { captureWithShell } from "./captureMethods/captureShell.js";
import { captureWithGrim } from "./captureMethods/captureGrim.js";
import { CaptureBackend } from "./constants.js";

const availableBackends = {
  [CaptureBackend.SHELL]: captureWithShell,
  [CaptureBackend.GRIM]: captureWithGrim,
  [CaptureBackend.X11]: captureWithX11
}

export async function performCapture(
  selectionResult,
  captureBackendValue,
  { captureMode, includePointer },
) {
  let pixbuf = await availableBackends[captureBackendValue](includePointer, captureMode, selectionResult);
  
  return pixbuf;
}
