import { captureWithX11 } from "./captureMethods/captureX11.js";
import { captureWithShell } from "./captureMethods/captureShell.js";
import { captureWithGrim } from "./captureMethods/captureGrim.js";
import { CaptureBackend } from "./constants.js";
import { availableBackends } from "./utils.js";

const backends = {
  [CaptureBackend.SHELL]: captureWithShell,
  [CaptureBackend.GRIM]: captureWithGrim,
  [CaptureBackend.X11]: captureWithX11
}

export async function performCapture(
  selectionResult,
  captureBackendValue,
  { captureMode, includePointer },
) {
  // 1. Try preferred backend
  let pixbuf = null;
  try {
    pixbuf = await backends[captureBackendValue](includePointer, captureMode, selectionResult);
  } catch (e) {
    console.warn(`Preferred backend ${captureBackendValue} failed: ${e.message}`);
  }

  if (pixbuf) return pixbuf;

  // 2. Try available backends as fallback
  for (const backend of availableBackends) {
    if (backend === captureBackendValue) continue;

    try {
      console.log(`Trying fallback backend: ${backend}`);
      pixbuf = await backends[backend](includePointer, captureMode, selectionResult);
      if (pixbuf) return pixbuf;
    } catch (e) {
      console.warn(`Fallback backend ${backend} failed: ${e.message}`);
    }
  }

  return null;
}
