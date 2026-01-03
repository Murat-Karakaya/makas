import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GdkPixbuf from "gi://GdkPixbuf?version=2.0";
import { CaptureMode } from "../constants.js";

export async function captureWithGrim(includePointer, captureMode, params) {
    if (captureMode === CaptureMode.WINDOW) {
        throw new Error("Grim backend: Window capture mode is not supported. Please use X11 or Shell backend for window capture.");
    }

    let argv = ["grim"];

    if (includePointer) {
        argv.push("-c");
    }

    if (captureMode === CaptureMode.AREA) {
        const geometry = `${params.x},${params.y} ${params.width}x${params.height}`;
        argv.push("-g", geometry);
    }

    // Output to stdout
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

        // Close unused pipes
        GLib.close(stdin);
        GLib.close(stderr); // We might want to read stderr if it fails, but for now ignoring it.

        const stream = new Gio.UnixInputStream({ fd: stdout, close_fd: true });

        // Use PixbufLoader to load from stream
        const loader = new GdkPixbuf.PixbufLoader();

        return new Promise((resolve, reject) => {
            const buf = new Uint8Array(4096);

            const readNextChunk = () => {
                stream.read_bytes_async(4096, 0, null, (source, res) => {
                    try {
                        const bytes = source.read_bytes_finish(res);
                        if (bytes.get_size() > 0) {
                            loader.write(bytes.get_data());
                            readNextChunk();
                        } else {
                            // EOF
                            loader.close();
                            const pixbuf = loader.get_pixbuf();
                            GLib.spawn_close_pid(pid);
                            resolve(pixbuf);
                        }
                    } catch (e) {
                        try {
                            loader.close();
                        } catch (_) { }
                        GLib.spawn_close_pid(pid);
                        reject(e);
                    }
                });
            };

            readNextChunk();
        });

    } catch (e) {
        print(`Grim backend failed: ${e.message}`);
        return null;
    }
}
