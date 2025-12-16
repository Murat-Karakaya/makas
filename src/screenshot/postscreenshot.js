import Gtk from "gi://Gtk?version=3.0";
import Gdk from "gi://Gdk?version=3.0";
import GObject from "gi://GObject";

export const PostScreenshot = GObject.registerClass(
  class PostScreenshot extends Gtk.Box {
    _init(callbacks) {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        margin_start: 20,
        margin_end: 20,
        margin_bottom: 20,
        margin_top: 20,
      });
      this._callbacks = callbacks;

      this.buildUI();
    }

    buildUI() {
      const buttonBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.CENTER,
      });

      const backBtn = new Gtk.Button({ label: "Back" });
      backBtn.connect("clicked", () => {
        if (this._callbacks.onBack) {
          this._callbacks.onBack();
        }
      });

      const copyBtn = new Gtk.Button({ label: "Copy to Clipboard" });
      copyBtn.get_style_context().add_class(Gtk.STYLE_CLASS_SUGGESTED_ACTION);
      copyBtn.connect("clicked", () => {
        this.onCopyToClipboard();
      });

      buttonBox.pack_start(backBtn, false, false, 0);
      buttonBox.pack_start(copyBtn, false, false, 0);
      this.add(buttonBox);

      this._image = new Gtk.Image();
      const scrolledWindow = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        shadow_type: Gtk.ShadowType.IN,
      });
      scrolledWindow.add(this._image);

      // To make the scrolled window expand and fill the available space
      scrolledWindow.set_vexpand(true);
      scrolledWindow.set_hexpand(true);

      this.add(scrolledWindow);

      this._statusLabel = new Gtk.Label({
        label: "",
        halign: Gtk.Align.CENTER,
        margin_top: 8,
      });
      this.add(this._statusLabel);
    }

    setImage(pixbuf) {
      this.pixbuf = pixbuf;
      this._image.set_from_pixbuf(pixbuf);
    }

    onCopyToClipboard() {
      if (!this.pixbuf) {
        this._statusLabel.set_text("No screenshot to copy");
        return;
      }

      const CLIPBOARD_ATOM = Gdk.Atom.intern("CLIPBOARD", false);
      const clipboard = Gtk.Clipboard.get(CLIPBOARD_ATOM);
      clipboard.set_image(this.pixbuf);
      clipboard.store();

      this._statusLabel.set_text("Copied to clipboard");
    }
  },
);
