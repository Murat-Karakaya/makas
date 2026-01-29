import GLib from "gi://GLib";
import Gio from "gi://Gio";

/**
 * XWayland area selection for GNOME Wayland.
 * Spawns a subprocess with GDK_BACKEND=x11 to force XWayland rendering.
 */
export async function selectAreaXWayland(bgPixbuf) {
    // Check if XWayland fallback is disabled
    const disableXWayland = GLib.getenv("MAKAS_DISABLE_XWAYLAND_FALLBACK") === "1";
    if (disableXWayland) {
        print("XWayland fallback disabled, using native X11 selection");
        const { selectAreaX11 } = await import("./selectAreaX11.js");
        return selectAreaX11(bgPixbuf);
    }

    print("Selection: selectAreaXWayland - saving pixbuf for subprocess");

    const tempDir = GLib.get_tmp_dir();
    const timestamp = Date.now();
    const tempImagePath = GLib.build_filenamev([tempDir, `makas_area_select_bg_${timestamp}.png`]);
    const tempResultPath = GLib.build_filenamev([tempDir, `makas_area_select_result_${timestamp}.json`]);
    const tempScriptPath = GLib.build_filenamev([tempDir, `makas_xwayland_helper_${timestamp}.mjs`]);
    const tempDrawerPath = GLib.build_filenamev([tempDir, "selectionDrawer.js"]);

    try {
        // Save pixbuf to temp file
        bgPixbuf.savev(tempImagePath, "png", [], []);

        // Get the path to our helper script.
        // We use Gio.File to handle both file:// and resource:// URIs correctly.
        let currentUri = import.meta.url;
        const lastSlash = currentUri.lastIndexOf("/");
        const baseUri = currentUri.substring(0, lastSlash);
        const scriptUri = `${baseUri}/xwayland-helper.js`;
        const drawerUri = `${baseUri}/selectionDrawer.js`;

        const scriptFile = Gio.File.new_for_uri(scriptUri);
        const [success, scriptContent] = scriptFile.load_contents(null);

        if (!success) {
            throw new Error(`Failed to read xwayland-helper.js from ${scriptUri}`);
        }

        const drawerFile = Gio.File.new_for_uri(drawerUri);
        const [dSuccess, drawerContent] = drawerFile.load_contents(null);

        if (!dSuccess) {
            throw new Error(`Failed to read selectionDrawer.js from ${drawerUri}`);
        }

        // Write the script to a temp file so gjs can execute it easily as a file
        GLib.file_set_contents(tempScriptPath, scriptContent);
        // Write the drawer module
        GLib.file_set_contents(tempDrawerPath, drawerContent);

        // Run the subprocess with GDK_BACKEND=x11
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.NONE,
        });
        launcher.setenv("GDK_BACKEND", "x11", true);

        const proc = launcher.spawnv([
            "gjs",
            "-m",
            tempScriptPath,
            tempImagePath,
            tempResultPath,
        ]);

        // Wait for subprocess to complete
        const waitResult = await new Promise((resolve, reject) => {
            proc.wait_async(null, (source, result) => {
                try {
                    source.wait_finish(result);
                    resolve(source.get_successful());
                } catch (e) {
                    reject(e);
                }
            });
        });

        if (!waitResult) {
            print("XWayland area selection subprocess failed or was cancelled");
            return null;
        }

        // Read the result
        const resultFile = Gio.File.new_for_path(tempResultPath);
        if (!resultFile.query_exists(null)) {
            print("XWayland area selection: no result file generated");
            return null;
        }

        const [, contents] = resultFile.load_contents(null);
        const decoder = new TextDecoder();
        const resultJson = decoder.decode(contents);

        try {
            const result = JSON.parse(resultJson);
            if (result.aborted) {
                return null;
            }

            return {
                x: result.x,
                y: result.y,
                width: result.width,
                height: result.height,
            };
        } catch (e) {
            print("Failed to parse result JSON: " + e);
            return null;
        }

    } catch (e) {
        print(`Error in selectAreaXWayland: ${e.message}`);
        return null;
    } finally {
        // Cleanup temp files
        const cleanup = (path) => {
            try {
                if (path) GLib.unlink(path);
            } catch (e) { /* ignore */ }
        };
        cleanup(tempImagePath);
        cleanup(tempResultPath);
        cleanup(tempScriptPath);
        cleanup(tempDrawerPath);
    }
}
