import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GdkPixbuf from "gi://GdkPixbuf";
import { getCurrentDate, getDestinationPath, settings } from "../utils.js";
import { SOURCE_PATH } from "../constants.js";

export const PostScreenshot = GObject.registerClass(
  class PostScreenshot extends Gtk.Box {
    _init(callbacks) {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        margin_start: 20,
        margin_end: 20,
        margin_bottom: 20,
        margin_top: 20,
      });
      this._callbacks = callbacks;
      this.pixbuf = null;
      this.currentFilepath = null;
      this.fileMonitor = null;

      this.buildUI();
    }

    buildUI() {
      const builder = new Gtk.Builder();
      builder.add_from_resource(SOURCE_PATH + "/screenshot/postscreenshot/postscreenshot.ui");

      const mainBox = builder.get_object("main");
      this.add(mainBox);

      const backBtn = builder.get_object("backBtn");
      backBtn.connect("clicked", () => {
        if (this._callbacks.onBack) {
          this._callbacks.onBack();
        }
      });

      this.saveBtn = builder.get_object("saveBtn");
      this.saveBtn.connect("clicked", () => this.onSave());

      this.saveAsBtn = builder.get_object("saveAsBtn");
      this.saveAsBtn.connect("clicked", () => this.onSaveAs());
      
      this.openAppBtn = builder.get_object("openAppBtn");
      this.openAppBtn.connect("clicked", () => this.onOpenApp());
      
      this.openWithBtn = builder.get_object("openWithBtn");
      this.openWithBtn.connect("clicked", () => this.onOpenWith());

      const copyBtn = builder.get_object("copyBtn");
      copyBtn.connect("clicked", () => this.onCopyToClipboard());

      // DrawingArea for auto-scaling image
      this.drawingArea = new Gtk.DrawingArea();
      this.drawingArea.set_vexpand(true);
      this.drawingArea.set_hexpand(true);
      this.drawingArea.connect("draw", (widget, cr) => this.onDraw(widget, cr));
      
      const imageContainer = builder.get_object("imageContainer");
      imageContainer.add(this.drawingArea);

      this.statusLabel = builder.get_object("statusLabel");
    }

    setImage(pixbuf) {
      this.pixbuf = pixbuf;
      // Reset current file path and monitor when a new screenshot is taken/set
      if (this.fileMonitor) {
        this.fileMonitor.cancel();
        this.fileMonitor = null;
      }
      this.currentFilepath = null;
      
      this.drawingArea.queue_draw();
      this.statusLabel.set_text("");
    }

    onDraw(widget, cr) {
      if (!this.pixbuf) return false;

      const widgetWidth = widget.get_allocated_width();
      const widgetHeight = widget.get_allocated_height();
      const pixWidth = this.pixbuf.get_width();
      const pixHeight = this.pixbuf.get_height();

      const scale = Math.min(widgetWidth / pixWidth, widgetHeight / pixHeight);
      const drawWidth = pixWidth * scale;
      const drawHeight = pixHeight * scale;

      const x = (widgetWidth - drawWidth) / 2;
      const y = (widgetHeight - drawHeight) / 2;

      cr.save();
      cr.translate(x, y);
      cr.scale(scale, scale);
      Gdk.cairo_set_source_pixbuf(cr, this.pixbuf, 0, 0);
      cr.paint();
      cr.restore();

      return false;
    }

    onSave() {
      if (!this.pixbuf) return;

      const folder = settings.get_string("screenshot-save-folder");
      const filename = `Screenshot-${getCurrentDate()}.png`;
      const filepath = getDestinationPath({ folder, filename });

      if (filepath) {
        try {
          this.pixbuf.savev(filepath, "png", [], []);
          this.statusLabel.set_text(`Saved to: ${filepath}`);
        } catch {
          try {
            const folder = GLib.get_home_dir();
            const filepath = getDestinationPath({ folder, filename });
            this.pixbuf.savev(filepath, "png", [], []);
            this.statusLabel.set_text(`Saved to: ${filepath}`);
          } catch (e) {
            this.statusLabel.set_text(`Save failed: ${e.message}`);
          }
        }
      }
    }

    onSaveAs() {
      if (!this.pixbuf) return;

      const dialog = new Gtk.FileChooserDialog({
        title: "Save Screenshot As",
        action: Gtk.FileChooserAction.SAVE,
        transient_for: this.get_toplevel(),
        modal: true,
      });

      dialog.add_button("_Cancel", Gtk.ResponseType.CANCEL);
      dialog.add_button("_Save", Gtk.ResponseType.ACCEPT);
      dialog.set_do_overwrite_confirmation(true);
      dialog.set_current_name(`Screenshot-${getCurrentDate()}.png`);
      dialog.set_current_folder(settings.get_string("screenshot-save-folder"));

      dialog.connect("response", (d, response) => {
        if (response === Gtk.ResponseType.ACCEPT) {
          const filepath = d.get_filename();
          if (filepath) {
            try {
              this.pixbuf.savev(filepath, "png", [], []);
              this.statusLabel.set_text(`Saved to: ${filepath}`);
              if (settings.get_boolean("last-screenshot-save-folder")) {
                settings.set_string("screenshot-save-folder", filepath);
              }
            } catch (e) {
              this.statusLabel.set_text(`Save failed: ${e.message}`);
            }
          }
        }
        dialog.destroy();
      });

      dialog.show();
    }
    
    ensureFile() {
      if (this.currentFilepath) return this.currentFilepath;
      
      const tmpDir = GLib.get_tmp_dir();
      const filename = `makas-temp-${getCurrentDate()}.png`;
      const filepath = getDestinationPath({ folder: tmpDir, filename });
            
      try {
        this.pixbuf.savev(filepath, "png", [], []);
        this.currentFilepath = filepath;
        this.setupFileMonitor();
        return filepath;
      } catch (e) {
        console.error("Failed to save temp file", e);
        this.statusLabel.set_text(`Error creating temp file: ${e.message}`);
        return null;
      }
    }
    
    setupFileMonitor() {
      if (this.fileMonitor) {
        this.fileMonitor.cancel();
        this.fileMonitor = null;
      }
      
      if (!this.currentFilepath) return;
      
      const file = Gio.File.new_for_path(this.currentFilepath);
      this.fileMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
      this.fileMonitor.connect("changed", (monitor, file, otherFile, eventType) => {
        if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
           try {
             // Reload pixbuf from file
             const newPixbuf = GdkPixbuf.Pixbuf.new_from_file(this.currentFilepath);
             // Update the internal pixbuf directly without resetting monitor/filepath
             this.pixbuf = newPixbuf;
             this.drawingArea.queue_draw();
           } catch (e) {
             console.error("Error reloading image", e);
           }
        }
      });
    }
    
    onOpenWith() {
      const filepath = this.ensureFile();
      if (!filepath) return;
      
      const file = Gio.File.new_for_path(filepath);
      
      const dialog = new Gtk.Dialog({
        transient_for: this.get_toplevel(), 
        modal: true,
        destroy_with_parent: true,
        title: "Open screenshot with"
      });

      const chooser = new Gtk.AppChooserWidget({ content_type: "image/png", vexpand: true });
      dialog.get_content_area().add(chooser);
      dialog.add_button("_Cancel", Gtk.ResponseType.CANCEL);
      dialog.add_button("_Open", Gtk.ResponseType.OK);

      // UX: Double-clicking an app should trigger "Open"
      chooser.connect("application-activated", () => dialog.response(Gtk.ResponseType.OK));
  
      dialog.connect("response", (self, response_id) => {
        if (response_id === Gtk.ResponseType.OK) {
          // Get selection from the widget, not the dialog
          const appInfo = chooser.get_app_info();
          if (appInfo) appInfo.launch([file], null);
        }
        self.destroy();
      });
  
      dialog.show_all();
    }
    
    onOpenApp() {
      const filepath = this.ensureFile();
      if (!filepath) return;
      
      try {
          const file = Gio.File.new_for_path(filepath);
          const success = Gio.AppInfo.launch_default_for_uri(file.get_uri(), null);
          if (!success) {
              this.statusLabel.set_text("No default application found for this file type.");
          }
      } catch (e) {
          this.statusLabel.set_text(`Error opening app: ${e.message}`);
      }
    }

    onCopyToClipboard() {
      if (!this.pixbuf) {
        this.statusLabel.set_text("No screenshot to copy");
        return;
      }

      const CLIPBOARD_ATOM = Gdk.Atom.intern("CLIPBOARD", false);
      const clipboard = Gtk.Clipboard.get(CLIPBOARD_ATOM);
      clipboard.set_image(this.pixbuf);
      //clipboard.store(); //this hangs the app for a bit. DE's don't need this and shouldn't be a big problems on TWM's

      this.statusLabel.set_text("Copied to clipboard");
    }
  },
);
