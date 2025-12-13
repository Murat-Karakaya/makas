/**
 * screenshot.js - Screenshot page with gnome-screenshot feature parity
 * 
 * Features:
 * - Capture modes: Screen, Window, Area
 * - Delay timer (0-60 seconds)
 * - Include pointer toggle
 * - Copy to clipboard
 * - Save with file chooser
 */

import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { settings } from '../window.js';
import { getCurrentDate } from '../utils.js';
import { selectArea, selectWindow } from './area-selection.js';

// Capture mode enumeration
const CaptureMode = {
    SCREEN: 0,
    WINDOW: 1,
    AREA: 2,
};

export const ScreenshotPage = GObject.registerClass(
    class ScreenshotPage extends Gtk.Box {
        _init() {
            super._init({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 16,
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
                margin_start: 20,
                margin_end: 20,
            });

            this._captureMode = CaptureMode.SCREEN;
            this._lastPixbuf = null;

            this._buildUI();
        }

        _buildUI() {
            // === Capture Mode Section ===
            const modeFrame = new Gtk.Frame({ label: 'Capture Mode' });
            const modeBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
                halign: Gtk.Align.CENTER,
            });

            this._screenRadio = new Gtk.RadioButton({ label: 'Screen' });
            this._windowRadio = new Gtk.RadioButton({ label: 'Window', group: this._screenRadio });
            this._areaRadio = new Gtk.RadioButton({ label: 'Area', group: this._screenRadio });

            modeBox.pack_start(this._screenRadio, false, false, 0);
            modeBox.pack_start(this._windowRadio, false, false, 0);
            modeBox.pack_start(this._areaRadio, false, false, 0);
            modeFrame.add(modeBox);
            this.add(modeFrame);

            this._screenRadio.connect('toggled', () => {
                if (this._screenRadio.get_active()) this._captureMode = CaptureMode.SCREEN;
            });
            this._windowRadio.connect('toggled', () => {
                if (this._windowRadio.get_active()) this._captureMode = CaptureMode.WINDOW;
            });
            this._areaRadio.connect('toggled', () => {
                if (this._areaRadio.get_active()) this._captureMode = CaptureMode.AREA;
            });

            // === Options Section ===
            const optionsFrame = new Gtk.Frame({ label: 'Options' });
            const optionsGrid = new Gtk.Grid({
                row_spacing: 8,
                column_spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
            });

            // Delay spinner
            const delayLabel = new Gtk.Label({ label: 'Delay (seconds):', halign: Gtk.Align.START });
            this._delaySpinner = new Gtk.SpinButton({
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 60 * 60 * 24,
                    step_increment: 1,
                }),
                value: settings.get_int('screenshot-delay'),
            });

            // Include pointer toggle
            const pointerLabel = new Gtk.Label({ label: 'Include pointer:', halign: Gtk.Align.START });
            this._pointerSwitch = new Gtk.Switch({
                active: settings.get_boolean('include-pointer'),
                halign: Gtk.Align.START,
            });

            optionsGrid.attach(delayLabel, 0, 0, 1, 1);
            optionsGrid.attach(this._delaySpinner, 1, 0, 1, 1);
            optionsGrid.attach(pointerLabel, 0, 1, 1, 1);
            optionsGrid.attach(this._pointerSwitch, 1, 1, 1, 1);
            optionsFrame.add(optionsGrid);
            this.add(optionsFrame);

            // === File Section ===
            const fileFrame = new Gtk.Frame({ label: 'Save Location' });
            const fileGrid = new Gtk.Grid({
                row_spacing: 8,
                column_spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
            });

            const folderLabel = new Gtk.Label({ label: 'Folder:', halign: Gtk.Align.START });
            this._folderBtn = new Gtk.FileChooserButton({
                title: 'Select Folder',
                action: Gtk.FileChooserAction.SELECT_FOLDER,
                width_chars: 30,
            });
            this._folderBtn.set_current_folder(settings.get_string('default-screenshot-folder'));

            const nameLabel = new Gtk.Label({ label: 'Filename:', halign: Gtk.Align.START });
            this._filenameEntry = new Gtk.Entry({
                text: `Screenshot-${getCurrentDate()}.png`,
                placeholder_text: 'screenshot.png',
                width_chars: 30,
            });

            fileGrid.attach(folderLabel, 0, 0, 1, 1);
            fileGrid.attach(this._folderBtn, 1, 0, 1, 1);
            fileGrid.attach(nameLabel, 0, 1, 1, 1);
            fileGrid.attach(this._filenameEntry, 1, 1, 1, 1);
            fileFrame.add(fileGrid);
            this.add(fileFrame);

            // === Action Buttons ===
            const buttonBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                halign: Gtk.Align.CENTER,
                margin_top: 8,
            });

            this._shootBtn = new Gtk.Button({ label: 'Take Screenshot' });
            this._shootBtn.get_style_context().add_class(Gtk.STYLE_CLASS_SUGGESTED_ACTION);

            this._copyBtn = new Gtk.Button({ label: 'Copy to Clipboard' });
            this._copyBtn.set_sensitive(false);

            buttonBox.pack_start(this._shootBtn, false, false, 0);
            buttonBox.pack_start(this._copyBtn, false, false, 0);
            this.add(buttonBox);


            this._statusLabel = new Gtk.Label({
                label: 'Ready',
                halign: Gtk.Align.CENTER,
                margin_top: 8,
            });
            this.add(this._statusLabel);


            this._shootBtn.connect('clicked', () => this._onTakeScreenshot());
            this._copyBtn.connect('clicked', () => this._onCopyToClipboard());
        }

        _getDestinationPath() {
            let folder = this._folderBtn.get_filename();
            const name = this._filenameEntry.get_text();
            if (!folder || !name) return null;
            if (!folder.endsWith('/')) folder += '/';
            return folder + name;
        }

        _onTakeScreenshot() {
            print('Screenshot: _onTakeScreenshot enter');

            const app = Gio.Application.get_default();
            if (app) {
                print(`Screenshot: App found ${app}, holding`);
                app.hold(); // Hold app to prevent it from exiting
            } else {
                print('Screenshot: WARNING - App not found via get_default()');
            }

            const topLevel = this.get_toplevel();

            // STEP 1: Hide Window
            if (topLevel && topLevel.hide) {
                print('Screenshot: Hiding window');
                topLevel.hide();
            }

            // Start flow after small delay to allow hide
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {

                print(`Screenshot: Selection phase, mode=${this._captureMode}`);

                // STEP 2: Selection
                if (this._captureMode === CaptureMode.AREA) {
                    selectArea((result) => {
                        if (!result) {
                            print('Screenshot: Area selection cancelled');
                            this._statusLabel.set_text('Capture cancelled');
                            this._finishScreenshot(app, topLevel);
                        } else {
                            this._startDelay(app, topLevel, result);
                        }
                    });
                    return GLib.SOURCE_REMOVE;
                }

                if (this._captureMode === CaptureMode.WINDOW) {
                    selectWindow((result) => {
                        if (!result) {
                            print('Screenshot: Window selection cancelled');
                            this._statusLabel.set_text('Capture cancelled');
                            this._finishScreenshot(app, topLevel);
                        } else {
                            this._startDelay(app, topLevel, result);
                        }
                    });
                    return GLib.SOURCE_REMOVE;
                }

                // Screen mode
                this._startDelay(app, topLevel, null);
                return GLib.SOURCE_REMOVE;
            });
        }

        _startDelay(app, topLevel, selectionResult) {

            const delay = this._delaySpinner.get_value_as_int();
            print(`Screenshot: Delay phase, delay=${delay}`);

            if (delay > 0) {
                let remaining = delay;
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    remaining--;
                    print(`Screenshot: Waiting... ${remaining}`);
                    if (remaining <= 0) {
                        this._performCapture(app, topLevel, selectionResult);
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
                return;
            }
            this._performCapture(app, topLevel, selectionResult);
        }

        _performCapture(app, topLevel, selectionResult) {
            print('Screenshot: Capturing...');
            let pixbuf = null;

            try {

                switch (this._captureMode) {
                    case CaptureMode.SCREEN:
                        pixbuf = this._captureScreen();
                        break;
                    case CaptureMode.WINDOW:
                        pixbuf = this._captureWindow(selectionResult); // Pass selection result
                        break;
                    case CaptureMode.AREA:
                        if (selectionResult) {
                            const rootWindow = Gdk.get_default_root_window();
                            pixbuf = Gdk.pixbuf_get_from_window(
                                rootWindow,
                                selectionResult.x,
                                selectionResult.y,
                                selectionResult.width,
                                selectionResult.height
                            );
                        }
                        break;

                    default:
                        this._statusLabel.set_text('Capture cancelled or failed');
                        break;
                }

                // Add pointer if enabled
                if (this._pointerSwitch.get_active() && this._captureMode !== CaptureMode.AREA) {
                    pixbuf = this._compositePointer(pixbuf);
                }

                this._lastPixbuf = pixbuf;
                this._copyBtn.set_sensitive(true);

                // Save to file
                const filepath = this._getDestinationPath();
                if (filepath) {
                    pixbuf.savev(filepath, 'png', [], []);
                    this._statusLabel.set_text(`Saved: ${filepath}`);

                    // Update last save directory
                    const folder = this._folderBtn.get_filename();
                    if (folder) {
                        settings.set_string('screenshot-last-save-directory', folder);
                    }

                    // Update filename for next screenshot
                    this._filenameEntry.set_text(`Screenshot-${getCurrentDate()}.png`);
                }

            } catch (e) {
                print(`Screenshot error: ${e.message}`);
                this._statusLabel.set_text(`Error: ${e.message}`);
            }

            this._finishScreenshot(app, topLevel);
        }

        _finishScreenshot(app, topLevel) {
            print('Screenshot: Restoring window');

            if (topLevel && topLevel.show) {
                topLevel.show();
                topLevel.present();
            }

            if (app) app.release();
            this._shootBtn.set_sensitive(true);
        }



        _captureScreen() {
            const rootWindow = Gdk.get_default_root_window();
            return Gdk.pixbuf_get_from_window(rootWindow, 0, 0, rootWindow.get_width(), rootWindow.get_height());
        }

        _captureWindow(selectionResult) {
            const screen = Gdk.Screen.get_default();
            let activeWindow = null;

            if (selectionResult) {
                // Find window at clicked active coordinates
                // rootWindow.get_window_at_position is not available in GDK3 introspection
                // We iterate the window stack to find which window contains the point
                const windows = screen.get_window_stack();
                if (windows) {
                    // Start from top (end of list)
                    for (let i = windows.length - 1; i >= 0; i--) {
                        const win = windows[i];
                        if (!win.is_visible()) continue;

                        // Check bounds
                        // win.get_frame_extents() returns the total area including decorations
                        const rect = win.get_frame_extents();

                        if (selectionResult.x >= rect.x &&
                            selectionResult.x < (rect.x + rect.width) &&
                            selectionResult.y >= rect.y &&
                            selectionResult.y < (rect.y + rect.height)) {
                            activeWindow = win;
                            print(`Screenshot: Found window at ${selectionResult.x},${selectionResult.y}: ${win}`);
                            break;
                        }
                    }
                }
            }

            if (!activeWindow) {
                activeWindow = screen.get_active_window();
            }

            // Get toplevel window
            activeWindow = activeWindow.get_toplevel();

            // Get window geometry including frame using frame extents
            // timestamp get_geometry often returns 0/0 for unmapped or some types of windows
            const rect = activeWindow.get_frame_extents();
            const width = rect.width;
            const height = rect.height;
            const originX = rect.x;
            const originY = rect.y;

            print(`Screenshot: Capturing window rect: x=${originX}, y=${originY}, w=${width}, h=${height}`);

            if (width <= 0 || height <= 0) {
                print('Screenshot: Invalid window dimensions, falling back to screen capture');
                return this._captureScreen();
            }

            // Capture from root window at window position for frame decorations
            const rootWindow = Gdk.get_default_root_window();

            return Gdk.pixbuf_get_from_window(
                rootWindow,
                originX,
                originY,
                width,
                height
            );
        }

        _compositePointer(pixbuf) {
            try {
                const display = Gdk.Display.get_default();
                const cursor = Gdk.Cursor.new_for_display(display, Gdk.CursorType.LEFT_PTR);
                const cursorPixbuf = cursor.get_image();

                if (!cursorPixbuf) {
                    return pixbuf;
                }

                // Get cursor position
                const seat = display.get_default_seat();
                const pointer = seat.get_pointer();
                const [, x, y] = pointer.get_position();

                // Get cursor hotspot
                const xHotStr = cursorPixbuf.get_option('x_hot');
                const yHotStr = cursorPixbuf.get_option('y_hot');
                const xHot = xHotStr ? parseInt(xHotStr) : 0;
                const yHot = yHotStr ? parseInt(yHotStr) : 0;

                const cursorX = x - xHot;
                const cursorY = y - yHot;

                // Only composite if cursor is within screenshot bounds
                if (cursorX >= 0 && cursorY >= 0 &&
                    cursorX < pixbuf.get_width() && cursorY < pixbuf.get_height()) {

                    const cursorWidth = Math.min(
                        cursorPixbuf.get_width(),
                        pixbuf.get_width() - cursorX
                    );
                    const cursorHeight = Math.min(
                        cursorPixbuf.get_height(),
                        pixbuf.get_height() - cursorY
                    );

                    cursorPixbuf.composite(
                        pixbuf,
                        cursorX, cursorY,
                        cursorWidth, cursorHeight,
                        cursorX, cursorY,
                        1.0, 1.0,
                        GdkPixbuf.InterpType.BILINEAR,
                        255
                    );
                }
            } catch (e) {
                print(`Failed to composite pointer: ${e.message}`);
            }

            return pixbuf;
        }

        _onCopyToClipboard() {
            if (!this._lastPixbuf) {
                this._statusLabel.set_text('No screenshot to copy');
                return;
            }

            const clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);
            clipboard.set_image(this._lastPixbuf);
            this._statusLabel.set_text('Copied to clipboard');
        }
    }
);
