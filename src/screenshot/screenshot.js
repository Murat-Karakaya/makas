import Gtk from "gi://Gtk?version=3.0";
import GObject from "gi://GObject";
import { PreScreenshot } from "./prescreenshot/prescreenshot.js";
import { PostScreenshot } from "./postscreenshot.js";

export const ScreenshotPage = GObject.registerClass(
  class ScreenshotPage extends Gtk.Box {
    _init() {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
      });

      this.stack = new Gtk.Stack({
        transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
        transition_duration: 300,
      });

      this.preScreenshot = new PreScreenshot({
        setUpPostScreenshot: this.setUpPostScreenshot.bind(this),
      });
      this.postScreenshot = new PostScreenshot({
        onBack: this.onBackFromPost.bind(this),
      });

      this.stack.add_named(this.preScreenshot, "pre");
      this.stack.add_named(this.postScreenshot, "post");

      this.add(this.stack);
    }

    setUpPostScreenshot(pixbuf) {
      this.stack.set_visible_child_name("post");
      this.postScreenshot.setImage(pixbuf);
    }

    onBackFromPost() {
      this.preScreenshot.setStatus("Ready");
      this.stack.set_visible_child_name("pre");
    }
  },
);
