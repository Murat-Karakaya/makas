import {
	settings,
	showScreenshotNotification,
	wait,
	copyPixbuf,
	backends,
} from './screenshot/utils.js';
import {
	BackendSupport,
	CaptureMode,
} from './screenshot/constants.js';
import { performCapture } from './screenshot/captureMethods/performCapture.js';
import { selectArea } from './screenshot/areaSelectionMethods/selectArea.js';
import { flashRect } from './screenshot/popupWindows/flash.js';
import GLib from 'gi://GLib';

export async function executeCLIAction(app, window, options) {
  const {backend: captureBackendValue, mode, includePointer, disableFallback} = options;
  let delay = options.delay;
  const topLevel = window;

	while (delay > 0) {
    print(`Waiting ${delay--} seconds...`);
    await wait(1000);
  }

  let pixbuf;
  try {
    if (mode === CaptureMode.AREA) {
      const screenResult = await performCapture(captureBackendValue, {
        captureMode: CaptureMode.SCREEN,
        includePointer,
        topLevel,
        disableFallback
      });

      if (!screenResult || !screenResult.pixbuf) throw new Error("Pre-capture for area selection failed.");

      const selection = await selectArea(screenResult.pixbuf);
      if (!selection) {
        print("Area selection cancelled.");
        if (!options.interactive) app.quit();
        return;
      }

      pixbuf = screenResult.pixbuf.new_subpixbuf(
        Math.max(0, selection.x),
        Math.max(0, selection.y),
        Math.min(screenResult.pixbuf.get_width(), selection.width),
        Math.min(screenResult.pixbuf.get_height(), selection.height)
      );

      flashRect(selection.x, selection.y, selection.width, selection.height, topLevel);

    } else {
      const result = await performCapture(captureBackendValue, {
        captureMode: mode,
        includePointer,
        topLevel,
        disableFallback
      });
      pixbuf = result.pixbuf;
      flashRect(result.x, result.y, pixbuf.get_width(), pixbuf.get_height(), topLevel);
    }

    if (!pixbuf) {
      throw new Error("No pixbuf generated.");
    }

    // Post-Capture Actions
    if (options.file && checkFile(options.file)) { //prints required warnings if checks fail
	    pixbuf.savev(options.file, "png", [], []);
	    print(`Saved to ${options.file}`);
    }
    if (options.clipboard) {
      copyPixbuf(pixbuf);
      print(`Copied to clipboard.`);
    }
    if (options.clipboard || options.file) return app.quit();

    // Default: Show Post-Screenshot UI
    window.show();
    window.present();
    if (window.screenshotPage) {
      window.screenshotPage.setUpPostScreenshot(pixbuf);
    }
    showScreenshotNotification(app);

  } catch (e) {
    console.error(`Capture failed: ${e.message}`);
    app.quit();
  } finally {
	  const backend = options.backend || settings.get_string("capture-backend-auto");
	  if (options.includePointer && !BackendSupport[backend].includePointer) {
	    print(`[Makas] Warning: The specified flag '--include-pointer/-p' is ignored because backend '${backend.toLowerCase()}' does not support including pointer.`);

	    const supportedBackends = [];
	    for (const element in backends) {
	      if (backends[element].isAvailable() && BackendSupport[element].includePointer)
	     		supportedBackends.push(`'${element}'`);
	    }

	    if (supportedBackends.length === 0) {
	      print(`[Makas] Info: No backend in your system is found that supports including pointer.`);
	    } else {
	      print(`[Makas] Hint: Some backend(s) that support including pointer - ${supportedBackends.join(", ").toLowerCase()} - can be used in your system.`);
	    }
	  }
  }
}

function checkFile(file) { //This does not check if we have permission to write in folder
	if (GLib.file_test(file, GLib.FileTest.IS_DIR)) {
        print(`[Makas] Error: '${file}' is a directory. Argument '${arg}' requires a filename, not a folder.`);
        return false
  }
  let dirName = GLib.path_get_dirname(file);
  if (!GLib.file_test(dirName, GLib.FileTest.IS_DIR)) {
    print(`[Makas] Error: The directory '${dirName}' does not exist.`);
    return false;
  }
  return true;
}
