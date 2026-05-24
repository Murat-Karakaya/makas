import { backends } from "../utils.js";

export async function performCapture(
  captureBackendValue,
  props,
) {
  try {
    console.log("performCapture called", captureBackendValue, props);
    return await backends[captureBackendValue].capture(props);
  } catch (e) {
    console.error(`Backend ${captureBackendValue} failed: ${e.message}`);

    if (props.disableFallback) {
        throw new Error(`Backend ${captureBackendValue} failed and fallback is disabled: ${e.message}`);
    }

    for (const b in backends) {
      if (b === captureBackendValue) continue; // Already checked
      if (backends[b].isAvailable()) {
        console.log(`Falling back to ${b}`);
        try {
          return await backends[b].capture(props);
        } catch (error) {
          console.error(`Backend ${b} failed: ${error.message}`);
        }
      }
    }

    throw new Error("Capture failed. More info can be found in the logs.");
  }
}
