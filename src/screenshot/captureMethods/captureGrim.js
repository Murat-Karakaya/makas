import GLib from "gi://GLib";
import GioUnix from "gi://GioUnix";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import { CaptureMode } from "../constants.js";
import MakasScreenshot from "gi://MakasScreenshot?version=1.0";
import { flashRect } from "../popupWindows/flash.js";

let isAvailable = null;

export async function captureWithGrim({ includePointer, captureMode }) {
    if (captureMode === CaptureMode.WINDOW) {
        throw new Error("Window capture isn't supported in Grim Backend. Please use a different backend for window capture.");
    }

    let argv = ["grim"];

    if (includePointer) {
        argv.push("-c");
    }

    argv.push("-");

    try {
        const [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
            null, // working directory
            argv,
            null, // env
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null // child_setup
        );

        if (!success) {
            throw new Error("Failed to spawn grim");
        }
        GLib.close(stdin);
        GLib.close(stderr); // We might want to read stderr if it fails, but for now ignoring it.
        const stream = new GioUnix.InputStream({ fd: stdout, close_fd: true });

        // Use PixbufLoader to load from stream
        const loader = new GdkPixbuf.PixbufLoader();

        return new Promise((resolve, reject) => {
            try {
                let bytes;
                while ((bytes = stream.read_bytes(4096, null)) && bytes.get_size() > 0) {
                    loader.write(bytes.get_data());
                }
                loader.close();
                const pixbuf = loader.get_pixbuf();
                GLib.spawn_close_pid(pid);
                flashRect(0, 0, pixbuf.get_width(), pixbuf.get_height());
                resolve(pixbuf);
            } catch (e) {
                try {
                    loader.close();
                } catch (_) { }
                GLib.spawn_close_pid(pid);
                reject(e);
            }
        });

    } catch (e) {
        print(`Grim backend failed: ${e.message}`);
        return null;
    }
}

export function hasGrimScreenshot() {
  if (isAvailable !== null) return isAvailable;

  const waylandDisplay = GLib.getenv("WAYLAND_DISPLAY");
  if (!waylandDisplay) return isAvailable = false;

  const grimPath = GLib.find_program_in_path("grim");
  if (!grimPath) return isAvailable = false;

  try {
    return isAvailable = MakasScreenshot.utils_is_grim_supported();
  } catch (e) {
    console.error("Failed to check Grim availability:", e);
    return isAvailable = false;
  }
}
