import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";
import { CaptureMode } from "../constants.js";

let isAvailable = null; // We declare this to not recompute availability on every call

export async function captureWithZwlr({ includePointer, captureMode }) {
  if (captureMode === CaptureMode.WINDOW) {
    throw new Error("Window capture isn't supported in zwlr screencopy backend. Please use a different backend for window capture.");
  }

  const pixbuf = MakasScreenshot.capture_screencopy(includePointer);

  if (!pixbuf) {
    throw new Error("zwlr screencopy failed");
  }

  return {
    x: 0,
    y: 0,
    pixbuf,
  };
}

export function hasZwlrScreenshot() {
  if (isAvailable !== null) return isAvailable;
  try {
    return isAvailable = MakasScreenshot.is_zwlr_screencopy_supported();
  } catch (e) {
    console.error("Failed to check zwlr screencopy availability:", e);
    return isAvailable = false;
  }
}
