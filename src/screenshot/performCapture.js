import { captureWithX11 } from "./captureMethods/captureX11.js";
import { captureWithShell } from "./captureMethods/captureShell.js";
import { captureWithGrim } from "./captureMethods/captureGrim.js";
import { captureWithPortal } from "./captureMethods/capturePortal.js";
import { CaptureBackend } from "./constants.js";
import { isBackendAvailable } from "./utils.js";

const backends = {
  [CaptureBackend.SHELL]: captureWithShell,
  [CaptureBackend.GRIM]: captureWithGrim,
  [CaptureBackend.X11]: captureWithX11,
  [CaptureBackend.PORTAL]: captureWithPortal,
}

export async function performCapture(
  captureBackendValue,
  props,
) {
  try {
    console.log("performCapture called", captureBackendValue, props);
    return await backends[captureBackendValue](props);
  } catch (e) {
    console.error(`Backend ${captureBackendValue} failed: ${e.message}`);

    for (const b in backends) {
      if (b === captureBackendValue) continue; // Already checked
      if (isBackendAvailable(b)) {
        console.log(`Falling back to ${b}`);
        try {
          return await backends[b](props);
        } catch (error) {
          console.error(`Backend ${b} failed: ${error.message}`);
        }
      }
    }

    throw new Error("Capture failed. More info can be found in the logs.");
  }
}
