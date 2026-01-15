import { captureWithX11 } from "./captureMethods/captureX11.js";
import { captureWithShell } from "./captureMethods/captureShell.js";
import { captureWithGrim } from "./captureMethods/captureGrim.js";
import { CaptureBackend } from "./constants.js";
import { isBackendAvailable } from "./utils.js";

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
  try {
    return await backends[captureBackendValue](includePointer, captureMode, selectionResult);
  } catch (e) {
    console.error(`Backend ${captureBackendValue} failed: ${e.message}`);

    const backendNames = [CaptureBackend.X11, CaptureBackend.SHELL, CaptureBackend.GRIM];
    for (const b of backendNames) {
      if (b === captureBackendValue) continue; // Already checked
      if (isBackendAvailable(b)) {
        console.log(`Falling back to ${b}`);
        try {
          return await backends[b](includePointer, captureMode, selectionResult);
        } catch (error) {
          console.error(`Backend ${b} failed: ${error.message}`);
        }
      }
    }

    return null;
  }
}
