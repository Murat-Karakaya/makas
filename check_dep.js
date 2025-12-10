
const Gst = imports.gi.Gst;
try {
    Gst.init(null);
    print("GStreamer initialized successfully");
} catch (e) {
    print("Error initializing GStreamer: " + e.message);
}

const Gtk = imports.gi.Gtk;
try {
    Gtk.init(null);
    print("GTK initialized successfully");
} catch (e) {
    print("Error initializing GTK: " + e.message);
}
