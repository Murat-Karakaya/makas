import { backends } from './screenshot/utils.js';
import { CaptureMode } from './screenshot/constants.js';


const APP_VERSION = '0.1.0'; // Sync with main.js/meson.build

export function parseCLI(argv) {
    const args = argv.slice(1);
    const options = {
        action: null,
        mode: null,
        includePointer: false,
        pointerSet: false,
        backend: null,
        delay: null,
        clipboard: false,
        file: null,
        interactive: false,
        exit: false,
        settingsToSet: [],
        gjsArgv: [argv[0]]
    };

    const resolveBackend = (name) => {
        const lower = name.toLowerCase();
        for (const key in backends) {
            if (key.toLowerCase() === lower || backends[key].label.toLowerCase().includes(lower)) {
                return key;
            }
        }
        return name;
    };

    const isFlag = (arg) => arg.startsWith('-');

    // Check if we have any args that determine action, otherwise default to capture
    // But we need to parse first.

    for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        let val = null;
        
        if (arg === '--') continue;

        // Handle --param=value syntax
        if (arg.startsWith('--') && arg.includes('=')) {
            const parts = arg.split('=');
            arg = parts[0];
            val = parts.slice(1).join('=');
        }

        /*switch (arg) {
            case "--help":
            case "-h":
                
                break;
        
            default:
                break;
        }*/

        if (arg === '--help' || arg === '-h') {
             printHelp();
             options.exit = true;
             return options;
        } else if (arg === '--version') {
             print(`Makas ${APP_VERSION}`);
             options.exit = true;
             return options;
        } else if (arg === '--clipboard' || arg === '-c') {
            options.action = 'capture';
            options.clipboard = true;
        } else if (arg === '--window' || arg === '-w') {
            options.action = 'capture';
            options.mode = CaptureMode.WINDOW;
        } else if (arg === '--area' || arg === '-a') {
            options.action = 'capture';
            options.mode = CaptureMode.AREA;
        } else if (arg === '--include-pointer' || arg === '-p') {
            options.includePointer = true;
            options.pointerSet = true;
        } else if (arg === '--delay' || arg === '-d') {
            options.action = 'capture'; 
            if (val) {
                options.delay = parseInt(val, 10);
            } else if (i + 1 < args.length && !isFlag(args[i+1])) {
                options.delay = parseInt(args[++i], 10);
            } else {
                 print(`[Makas] Error: Argument '${arg}' requires a value (seconds).`);
                 options.exit = true;
            }
        } else if (arg === '--interactive' || arg === '-i') {
            options.interactive = true;
        } else if (arg === '--file' || arg === '-f') {
            options.action = 'capture';
            if (val) {
                options.file = val;
            } else if (i + 1 < args.length && !isFlag(args[i+1])) {
                options.file = args[++i];
            } else {
                 print(`[Makas] Error: Argument '${arg}' requires a filename.`);
                 options.exit = true;
            }
        } else if (arg === '--backend' || arg === '-b') {
             // Only setting backend doesn't imply capture action necessarily, 
             // but if no other action, we usually assume capture unless -i is passed.
             // We'll resolve this after loop.
             if (val) {
                options.backend = resolveBackend(val);
             } else if (i + 1 < args.length && !isFlag(args[i+1])) {
                options.backend = resolveBackend(args[++i]);
             } else {
                print(`[Makas] Error: Argument '${arg}' requires a backend name.`);
                options.exit = true;
             }
        } else if (arg === '--set' || arg === '-s') {
            let settingStr = val;
            if (!settingStr && i + 1 < args.length && !isFlag(args[i+1])) {
                 settingStr = args[++i];
            }
            
            if (settingStr) {
                const sParts = settingStr.split('=');
                if (sParts.length === 2) {
                    options.settingsToSet.push({key: sParts[0], value: sParts[1]});
                } else {
                    print(`[Makas] Error: Invalid format for --set. Use 'key=value'. Given: ${settingStr}`);
                    options.exit = true;
                }
                options.exit = true; 
            } else {
                print(`[Makas] Error: Argument '${arg}' requires a 'key=value' pair.`);
                options.exit = true;
            }
        } else {
            options.gjsArgv.push(arg);
        }
    }
    
    if (options.exit) return options;

    if (options.interactive) {
        options.action = null; // Forces main.js to use win.present() (PreScreenshot)
    } else {
        // If not interactive, and no specific action set, default to capture
        // But if we just set settings (--set), we exit already.
        // If we just set --backend but no --capture, do we capture?
        // User said: "not passing arguments should simply capture"
        // So default is capture.
        if (!options.action) {
             options.action = 'capture';
        }
    }

    return options;
}

function printHelp() {
    print(`Usage:
  makas [OPTION...]

Help Options:
  -h, --help                     Show help options

Application Options:
  -c, --clipboard                Send the grab directly to the clipboard
  -w, --window                   Grab a window instead of the entire screen
  -a, --area                     Grab an area of the screen instead of the entire screen
  -p, --include-pointer          Include the pointer with the screenshot
  -d, --delay=seconds            Take screenshot after specified delay [in seconds]
  -i, --interactive              Interactively set options
  -f, --file=filename            Save screenshot directly to this file
  --version                      Print version information and exit
  -b, --backend=backend          Select backend temporarily (x11, shell, grim, portal)
  -s, --set=key=value            Set a configuration option
`);
}