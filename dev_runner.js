
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const currentDir = GLib.get_current_dir();

// Load resources so templates and other assets are available
try {
    const srcResPath = GLib.build_filenamev([currentDir, 'src', 'src.gresource']);
    const srcRes = Gio.Resource.load(srcResPath);
    srcRes._register();

    const dataResPath = GLib.build_filenamev([currentDir, 'src', 'data.gresource']);
    const dataRes = Gio.Resource.load(dataResPath);
    dataRes._register();
} catch (e) {
    console.error("Failed to load resources. Ensure they are compiled.", e);
    System.exit(1);
}

// Import main dynamically to ensure resources are registered BEFORE module evaluation
const { main } = await import('./src/main.js');

// Run the application
main([System.programInvocationName, ...System.programArgs]);
