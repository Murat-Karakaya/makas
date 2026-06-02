import GLib from "gi://GLib";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";
import { CaptureMode } from "../constants.js";

let isAvailable = null;

export async function captureWithExtImg({ includePointer, captureMode }) {
  if (captureMode === CaptureMode.WINDOW) {
    throw new Error("Window capture isn't supported in ext imagecopy backend. Please use a different backend for window capture.");
  }

  const pixbuf = MakasScreenshot.capture_ext_image_copy(includePointer);

  if (!pixbuf) {
    throw new Error("ext imagecopy backend failed");
  }

  return {
    x: 0,
    y: 0,
    pixbuf,
  };
}

export function hasExtImgScreenshot() {
  if (isAvailable !== null) return isAvailable;

  const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
  if (!waylandDisplay) return isAvailable = false;

  try {
    return isAvailable = MakasScreenshot.is_zwlr_screencopy_supported() || MakasScreenshot.is_ext_img_supported();
  } catch (e) {
    console.error("Failed to check ext imagecopy capture availability:", e);
    return isAvailable = false;
  }
}
